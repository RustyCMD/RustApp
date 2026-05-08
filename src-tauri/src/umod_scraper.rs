//! Read uMod's plugin catalog via its JSON API.
//!
//! uMod is a Laravel-rendered site behind Cloudflare, but it exposes the
//! catalog as JSON at `/plugins/search.json` (paginated) and individual
//! plugin metadata at `/plugins/<slug>/latest.json`. The HTML index page
//! itself returns 403 to non-browser fetches, so we never go through it.
//!
//! Empirical request shape (matches what the official agent and the
//! `publicrust/umod-pluigns-dataset` parser hit):
//!
//! ```text
//! GET https://umod.org/plugins/search.json
//!     ?page=1
//!     &per_page=20
//!     &sort=latest_release_at
//!     &sortdir=desc
//!     &categories[]=rust
//!     &categories[]=universal
//!     &query=<search>
//! ```
//!
//! Response (only the keys we care about):
//!
//! ```json
//! {
//!   "data": [
//!     {
//!       "slug": "vanish",
//!       "name": "Vanish",
//!       "title": "Vanish",
//!       "author": "Whispers88",
//!       "description": "...",
//!       "latest_release_version": "1.7.0",
//!       "latest_release_at": "2024-08-12 09:14:33",
//!       "created_at": "2017-03-04 12:01:22",
//!       "updated_at": "2024-08-12 09:14:33"
//!     }
//!   ],
//!   "current_page": 1,
//!   "last_page": 142,
//!   "total": 2837
//! }
//! ```
//!
//! Download URL pattern (the listing JSON does not include it; we build it):
//!
//! ```text
//! https://umod.org/plugins/<slug>/download/<version>      (preferred)
//! https://umod.org/plugins/<slug>/download/latest         (fallback)
//! ```

use chrono::{DateTime, NaiveDateTime, Utc};
use once_cell::sync::Lazy;
use reqwest::Client;
use serde::Deserialize;

use crate::error::{AppError, Result};
use crate::models::{PluginMetaData, PluginStorePage};

const BASE: &str = "https://umod.org";
const PER_PAGE: u32 = 20;
const USER_AGENT: &str = concat!(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ",
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 RustApp/",
    env!("CARGO_PKG_VERSION"),
);

/// Single shared client. uMod's Cloudflare protection lets us through if we
/// look enough like a real browser; we set headers accordingly.
static HTTP: Lazy<Client> = Lazy::new(|| {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/json,text/javascript,*/*;q=0.1"),
    );
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::HeaderValue::from_static("en-US,en;q=0.9"),
    );
    headers.insert(
        reqwest::header::REFERER,
        reqwest::header::HeaderValue::from_static("https://umod.org/plugins"),
    );
    headers.insert(
        reqwest::header::CACHE_CONTROL,
        reqwest::header::HeaderValue::from_static("no-cache"),
    );
    Client::builder()
        .user_agent(USER_AGENT)
        .gzip(true)
        .timeout(std::time::Duration::from_secs(20))
        .default_headers(headers)
        .build()
        .expect("reqwest client")
});

#[derive(Deserialize)]
struct ApiResponse {
    #[serde(default)]
    data: Vec<ApiPlugin>,
    #[serde(default)]
    current_page: Option<u32>,
    #[serde(default)]
    last_page: Option<u32>,
    #[allow(dead_code)]
    #[serde(default)]
    total: Option<u32>,
}

#[derive(Deserialize)]
struct ApiPlugin {
    #[serde(default)]
    slug: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    latest_release_version: Option<String>,
    #[serde(default)]
    latest_release_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

pub async fn fetch_page(page: u32, search: Option<&str>) -> Result<PluginStorePage> {
    let page = page.max(1);
    let mut params: Vec<(&str, String)> = vec![
        ("page", page.to_string()),
        ("per_page", PER_PAGE.to_string()),
        ("sort", "latest_release_at".to_string()),
        ("sortdir", "desc".to_string()),
        // The duplicate key is on purpose — uMod expects `categories[]`
        // repeated. reqwest serializes both entries as separate query pairs.
        ("categories[]", "rust".to_string()),
        ("categories[]", "universal".to_string()),
    ];
    if let Some(q) = search.map(str::trim).filter(|q| !q.is_empty()) {
        params.push(("query", q.to_string()));
    }

    let resp = HTTP
        .get(format!("{BASE}/plugins/search.json"))
        .query(&params)
        .send()
        .await?
        .error_for_status()?;

    let api: ApiResponse = resp.json().await.map_err(|e| {
        AppError::store_non_json(format!("search.json: {e}"))
    })?;

    let items = api.data.into_iter().map(into_meta).collect::<Vec<_>>();

    let has_next = match (api.current_page, api.last_page) {
        (Some(cur), Some(last)) => cur < last,
        // If the server didn't tell us, assume there's more iff the page was full.
        _ => items.len() as u32 == PER_PAGE,
    };

    Ok(PluginStorePage {
        items,
        page: api.current_page.unwrap_or(page),
        has_next,
    })
}

/// Download the raw `.cs` source for a plugin.
///
/// The URL passed in is whatever we synthesised in [`into_meta`]; if the
/// caller has a specific version in hand they can build their own variant of
/// `/plugins/<slug>/download/<version>`.
///
/// **Why this streams instead of calling `.bytes()`:** uMod's download
/// endpoint advertises a `Content-Length` larger than the body it actually
/// sends (verified empirically — header says 45181, server sends 31612 of
/// valid C# that ends cleanly at the namespace's closing brace). Browsers
/// and curl tolerate the mismatch, but reqwest's `.bytes()` treats a short
/// body as a fatal `IncompleteBody` error and throws away the buffer — which
/// is why every plugin install was failing silently. We work around it by
/// reading the chunked stream and accepting a premature EOF *iff* we've
/// already received some content. A truly empty response still propagates.
pub async fn download_plugin(url: &str) -> Result<Vec<u8>> {
    let mut resp = HTTP.get(url).send().await?.error_for_status()?;
    let mut buf: Vec<u8> = Vec::new();
    loop {
        match resp.chunk().await {
            Ok(Some(b)) => buf.extend_from_slice(&b),
            Ok(None) => break,
            Err(e) => {
                if buf.is_empty() {
                    // Nothing arrived — that's a real network failure.
                    return Err(AppError::HttpRequest(e));
                }
                // Some bytes already in buf → uMod's Content-Length lie.
                // The .cs we got is the real one; downstream parse will
                // catch any genuinely-corrupt download with PLUGIN-003.
                log::warn!("download_plugin: tolerating premature EOF for {url}: {e}");
                break;
            }
        }
    }
    Ok(buf)
}

fn into_meta(p: ApiPlugin) -> PluginMetaData {
    let slug = p.slug.unwrap_or_default();
    let name = p
        .name
        .or(p.title)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| slug.clone());

    let download_url = if !slug.is_empty() {
        let version = p.latest_release_version.as_deref().unwrap_or("latest");
        Some(format!("{BASE}/plugins/{slug}/download/{version}"))
    } else {
        None
    };

    let page_url = if !slug.is_empty() {
        Some(format!("{BASE}/plugins/{slug}"))
    } else {
        None
    };

    let last_updated = p
        .latest_release_at
        .as_deref()
        .or(p.updated_at.as_deref())
        .and_then(parse_umod_timestamp);

    PluginMetaData {
        slug,
        name,
        author: p.author,
        version: p.latest_release_version,
        description: p.description,
        download_url,
        page_url,
        last_updated,
    }
}

/// uMod (Laravel + MySQL) hands timestamps back as either RFC3339 or
/// `YYYY-MM-DD HH:MM:SS`. Try both before giving up.
fn parse_umod_timestamp(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(naive.and_utc());
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pinned to the response shape we observed in the wild — if uMod
    /// changes a key name, this test fails loudly instead of returning an
    /// empty list at runtime.
    const SAMPLE: &str = r#"{
        "data": [
            {
                "slug": "vanish",
                "name": "Vanish",
                "title": "Vanish",
                "author": "Whispers88",
                "description": "Allows players with permission to become invisible",
                "latest_release_version": "1.7.0",
                "latest_release_at": "2024-08-12 09:14:33",
                "created_at": "2017-03-04 12:01:22",
                "updated_at": "2024-08-12 09:14:33"
            },
            {
                "slug": "kits",
                "name": null,
                "title": "Kits",
                "author": "k1lly0u",
                "description": "Loadout system",
                "latest_release_version": null,
                "latest_release_at": null,
                "created_at": "2014-11-01 00:00:00",
                "updated_at": "2025-01-15 10:00:00"
            }
        ],
        "current_page": 1,
        "last_page": 5,
        "total": 100,
        "per_page": 20
    }"#;

    #[test]
    fn parses_search_response() {
        let api: ApiResponse = serde_json::from_str(SAMPLE).unwrap();
        let metas: Vec<_> = api.data.into_iter().map(into_meta).collect();
        assert_eq!(metas.len(), 2);

        let v = &metas[0];
        assert_eq!(v.slug, "vanish");
        assert_eq!(v.name, "Vanish");
        assert_eq!(v.author.as_deref(), Some("Whispers88"));
        assert_eq!(v.version.as_deref(), Some("1.7.0"));
        assert_eq!(
            v.download_url.as_deref(),
            Some("https://umod.org/plugins/vanish/download/1.7.0"),
        );
        assert_eq!(
            v.page_url.as_deref(),
            Some("https://umod.org/plugins/vanish"),
        );
        assert!(v.last_updated.is_some());

        // Falls back to title when name is null, and to /download/latest
        // when no version is published yet.
        let k = &metas[1];
        assert_eq!(k.name, "Kits");
        assert_eq!(
            k.download_url.as_deref(),
            Some("https://umod.org/plugins/kits/download/latest"),
        );
        assert!(k.version.is_none());
    }

    #[test]
    fn parses_both_timestamp_shapes() {
        assert!(parse_umod_timestamp("2024-08-12 09:14:33").is_some());
        assert!(parse_umod_timestamp("2024-08-12T09:14:33Z").is_some());
        assert!(parse_umod_timestamp("not a date").is_none());
    }
}

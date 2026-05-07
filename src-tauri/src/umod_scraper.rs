//! Scrape <https://umod.org/plugins> for plugin metadata.
//!
//! The site renders an HTML index of plugins per page. We pull the slug,
//! title, author and short description from each card. The exact CSS
//! selectors will need to be tuned against the live markup — the structure
//! here keeps that contained to [`extract_items`] so the rest of the code
//! (paging, caching, downloads) is independent of layout drift.

use once_cell::sync::Lazy;
use reqwest::Client;
use scraper::{Html, Selector};

use crate::error::{AppError, Result};
use crate::models::{PluginMetaData, PluginStorePage};

const BASE: &str = "https://umod.org/plugins";
const USER_AGENT: &str = concat!("RustApp/", env!("CARGO_PKG_VERSION"));

static HTTP: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .user_agent(USER_AGENT)
        .gzip(true)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("reqwest client")
});

pub async fn fetch_page(page: u32, search: Option<&str>) -> Result<PluginStorePage> {
    let mut url = url::Url::parse(BASE)?;
    if let Some(q) = search.filter(|q| !q.is_empty()) {
        url.query_pairs_mut().append_pair("query", q);
    }
    if page > 1 {
        url.query_pairs_mut().append_pair("page", &page.to_string());
    }

    let body = HTTP.get(url.as_str()).send().await?.error_for_status()?;
    let html = body.text().await?;
    let items = extract_items(&html)?;
    let has_next = !items.is_empty() && page_link_exists(&html, page + 1);
    Ok(PluginStorePage {
        items,
        page,
        has_next,
    })
}

/// Download the raw `.cs` source for a plugin. The URL comes from
/// [`PluginMetaData::download_url`] which we previously scraped.
pub async fn download_plugin(url: &str) -> Result<Vec<u8>> {
    let bytes = HTTP
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    Ok(bytes.to_vec())
}

// ---------------------------------------------------------------------------
//  HTML extraction
// ---------------------------------------------------------------------------
//
// uMod's listing page renders cards that look roughly like this (subject to
// markup drift — re-tune `CARD` if results stop coming back):
//
//   <div class="plugin-card">
//     <a href="/plugins/<slug>" class="title">Plugin Name</a>
//     <div class="author">by Author</div>
//     <div class="version">1.2.3</div>
//     <p class="description">…</p>
//     <a href="/plugins/<slug>.cs" class="download">…</a>
//   </div>

static CARD: Lazy<Selector> = Lazy::new(|| Selector::parse(".plugin-card").unwrap());
static TITLE: Lazy<Selector> = Lazy::new(|| Selector::parse("a.title").unwrap());
static AUTHOR: Lazy<Selector> = Lazy::new(|| Selector::parse(".author").unwrap());
static VERSION: Lazy<Selector> = Lazy::new(|| Selector::parse(".version").unwrap());
static DESCRIPTION: Lazy<Selector> = Lazy::new(|| Selector::parse(".description").unwrap());
static DOWNLOAD: Lazy<Selector> = Lazy::new(|| Selector::parse("a.download").unwrap());
static PAGER: Lazy<Selector> = Lazy::new(|| Selector::parse("a.pagination, a.page").unwrap());

fn extract_items(html: &str) -> Result<Vec<PluginMetaData>> {
    let doc = Html::parse_document(html);
    let mut out = Vec::new();
    for card in doc.select(&CARD) {
        let title = card.select(&TITLE).next();
        let Some(title) = title else { continue };

        let href = title.value().attr("href").unwrap_or_default();
        let slug = href
            .trim_start_matches('/')
            .trim_start_matches("plugins/")
            .trim_end_matches(".cs")
            .to_string();
        if slug.is_empty() {
            continue;
        }

        let name = title.text().collect::<String>().trim().to_string();
        let author = card
            .select(&AUTHOR)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());
        let version = card
            .select(&VERSION)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());
        let description = card
            .select(&DESCRIPTION)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string());

        let download_url = card
            .select(&DOWNLOAD)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(|h| absolute(h));
        let page_url = Some(absolute(href));

        out.push(PluginMetaData {
            slug,
            name,
            author,
            version,
            description,
            download_url,
            page_url,
            last_updated: None,
        });
    }
    if out.is_empty() && doc.select(&CARD).next().is_none() {
        // Selectors didn't match anything — likely the markup changed.
        log::warn!("umod scraper: no plugin cards matched; selectors may be stale");
    }
    Ok(out)
}

fn page_link_exists(html: &str, page: u32) -> bool {
    let doc = Html::parse_document(html);
    let needle = format!("page={page}");
    doc.select(&PAGER)
        .filter_map(|a| a.value().attr("href"))
        .any(|h| h.contains(&needle))
}

fn absolute(href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        href.to_string()
    } else if let Some(stripped) = href.strip_prefix('/') {
        format!("https://umod.org/{stripped}")
    } else {
        format!("https://umod.org/{href}")
    }
}

#[allow(dead_code)]
fn _ensure_ok<T>(x: Result<T>) -> Result<T> {
    x.map_err(|e| AppError::scrape(e.to_string()))
}

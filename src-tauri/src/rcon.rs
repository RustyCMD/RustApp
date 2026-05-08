//! WebSocket RCON for Rust (Facepunch) game servers.
//!
//! Rust's RCON is *not* the Source-engine TCP protocol. The server hosts a
//! websocket at `ws://<host>:<rcon_port>/<password>` and exchanges JSON frames
//! shaped like `{"Identifier": <i32>, "Message": "<command>", "Name": "<tag>"}`.
//! Responses come back with the same `Identifier`, plus `Message` (text output)
//! and `Type` (e.g. `"Generic"`, `"Warning"`, `"Chat"`). We send a command,
//! wait for the first matching frame, and return its `Message`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use crate::error::{AppError, Result};
use crate::models::{BanInfo, PlayerInfo, RconTestResult, ServerStatus};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(10);
const CLIENT_NAME: &str = "RustApp";

/// Monotonic counter for RCON request identifiers. Critical that this is
/// **non-zero** — Rust's WebRcon treats `Identifier: 0` as the broadcast /
/// "no reply expected" value (spontaneous server log lines and chat traffic
/// are tagged 0), so a request sent with id 0 either gets no reply or
/// matches a stray broadcast frame. Started at 1 and skips 0 on wrap.
static NEXT_RCON_ID: AtomicI32 = AtomicI32::new(1);

fn next_identifier() -> i32 {
    let mut id = NEXT_RCON_ID.fetch_add(1, Ordering::Relaxed);
    if id == 0 {
        id = NEXT_RCON_ID.fetch_add(1, Ordering::Relaxed);
    }
    // Keep it in the positive i32 range so the JSON looks sane.
    id & 0x7fff_ffff
}

/// How long to suppress further RCON calls after an auth failure for a given
/// profile. Rust's RCON bans the source IP for 300 s once it sees five bad
/// passwords in a row — pollers like the dashboard, the topbar, and the
/// players page can easily produce that burst on a single profile switch
/// when the saved password is wrong. A 60 s cooldown keeps a single bad
/// reply from cascading into a ban.
const AUTH_FAIL_COOLDOWN: Duration = Duration::from_secs(60);

/// Per-profile timestamp of the last `RconClosed` (= bad password) reply.
/// Cleared by [`note_auth_success`] on a clean response and by
/// [`clear_auth_failure`] when the user updates the profile.
static AUTH_FAIL_AT: Lazy<Mutex<HashMap<String, Instant>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn auth_suspended(profile_id: &str) -> bool {
    let map = AUTH_FAIL_AT.lock().expect("auth-fail mutex");
    matches!(map.get(profile_id), Some(t) if t.elapsed() < AUTH_FAIL_COOLDOWN)
}

fn note_auth_failure(profile_id: &str) {
    AUTH_FAIL_AT
        .lock()
        .expect("auth-fail mutex")
        .insert(profile_id.to_string(), Instant::now());
}

fn note_auth_success(profile_id: &str) {
    AUTH_FAIL_AT
        .lock()
        .expect("auth-fail mutex")
        .remove(profile_id);
}

/// Public hook so `commands::update_server_profile` can wipe the cooldown
/// when the user fixes the password.
pub fn clear_auth_failure(profile_id: &str) {
    note_auth_success(profile_id);
}

#[derive(Serialize)]
struct RconRequest<'a> {
    #[serde(rename = "Identifier")]
    identifier: i32,
    #[serde(rename = "Message")]
    message: &'a str,
    #[serde(rename = "Name")]
    name: &'a str,
}

#[derive(Deserialize)]
struct RconResponse {
    #[serde(rename = "Identifier", default)]
    identifier: i32,
    #[serde(rename = "Message", default)]
    message: String,
    #[serde(rename = "Type", default)]
    #[allow(dead_code)]
    kind: Option<String>,
}

fn build_url(ip: &str, port: u16, password: &str) -> String {
    // Rust's RCON server takes the URL path segment as the literal password
    // — it does **not** percent-decode before comparing to `rcon.password`.
    // Form-encoding (the previous implementation) would turn `!` into `%21`
    // on the wire, the server would compare `Yelena%21` to `Yelena!`, and
    // every connection would fail as "incorrect password". So we encode the
    // bare minimum required for the URL parser to accept the URL: space, `?`
    // (query delim), `#` (fragment delim), and control characters. Common
    // password punctuation (`!`, `@`, `$`, `%`, `&`, `*`, `+`, etc.) passes
    // through verbatim.
    let mut pw = String::with_capacity(password.len());
    for b in password.bytes() {
        match b {
            b' ' | b'?' | b'#' | b'/' | b'\\' | 0..=0x1f | 0x7f => {
                pw.push_str(&format!("%{b:02X}"))
            }
            // Non-ASCII bytes have to be percent-encoded for any reasonable
            // URL parser. If a user's password contains them the server
            // won't match either way, but we at least produce a parseable URL.
            0x80..=0xff => pw.push_str(&format!("%{b:02X}")),
            _ => pw.push(b as char),
        }
    }
    format!("ws://{ip}:{port}/{pw}")
}

/// Connect, send a command, return the first matching response. Connection is
/// closed before returning. Suitable for fire-and-forget commands like
/// `oxide.load`/`oxide.unload`/`oxide.reload`.
///
/// `profile_id` keys the per-profile auth-failure cooldown — pass the same
/// value the caller looked the profile up by. If the profile is currently
/// in cooldown after a recent bad-password reply, this returns
/// [`AppError::RconAuthSuspended`] without dialing the server.
pub async fn send_command(
    profile_id: &str,
    ip: &str,
    port: u16,
    password: &str,
    command: &str,
) -> Result<String> {
    if password.is_empty() {
        return Err(AppError::RconNoPassword);
    }
    if auth_suspended(profile_id) {
        return Err(AppError::RconAuthSuspended);
    }

    let result = send_command_inner(ip, port, password, command).await;
    match &result {
        Ok(_) => note_auth_success(profile_id),
        // Facepunch closes the websocket immediately on a wrong password,
        // which surfaces here as RconClosed. Trip the breaker so concurrent
        // pollers (TopBar, Dashboard, Players) don't all blow through the
        // server's 5-attempts-then-ban threshold on the same bad creds.
        Err(AppError::RconClosed) => note_auth_failure(profile_id),
        _ => {}
    }
    result
}

async fn send_command_inner(
    ip: &str,
    port: u16,
    password: &str,
    command: &str,
) -> Result<String> {
    let url = build_url(ip, port, password);
    let (mut ws, _resp) = timeout(CONNECT_TIMEOUT, tokio_tungstenite::connect_async(&url))
        .await
        .map_err(|_| AppError::RconConnectTimeout)??;

    let identifier = next_identifier();
    let req = RconRequest {
        identifier,
        message: command,
        name: CLIENT_NAME,
    };
    ws.send(Message::Text(serde_json::to_string(&req)?)).await?;

    // Phase 1: wait for our identifier-matched reply. Many commands return
    // their full output here (`playerlist`, `serverinfo`, `version`).
    let mut broadcasts: Vec<String> = Vec::new();
    let matched = timeout(RESPONSE_TIMEOUT, async {
        while let Some(frame) = ws.next().await {
            let msg = frame?;
            if let Message::Text(text) = msg {
                if let Ok(resp) = serde_json::from_str::<RconResponse>(&text) {
                    if resp.identifier == identifier {
                        return Ok::<String, AppError>(resp.message);
                    }
                    // Hold non-matching frames in case the matched reply
                    // turns out to be empty — for commands like `oxide.reload`
                    // the server acks immediately with an empty matched
                    // frame and prints the actual output as broadcasts.
                    if !resp.message.is_empty() {
                        broadcasts.push(resp.message);
                    }
                }
            }
        }
        Err(AppError::RconClosed)
    })
    .await
    .map_err(|_| AppError::RconResponseTimeout)??;

    let answer = if !matched.trim().is_empty() {
        // Got real content on the matched frame — return immediately, no
        // extra latency for the common path.
        matched
    } else {
        // Empty matched ack. Give the server up to BROADCAST_GRACE for any
        // async broadcast frames carrying the actual output (oxide.reload
        // usage, kick reasons, etc.). Concatenate everything we collected.
        const BROADCAST_GRACE: Duration = Duration::from_millis(1500);
        let _ = timeout(BROADCAST_GRACE, async {
            while let Some(frame) = ws.next().await {
                if let Ok(Message::Text(text)) = frame {
                    if let Ok(resp) = serde_json::from_str::<RconResponse>(&text) {
                        if !resp.message.is_empty() {
                            broadcasts.push(resp.message);
                        }
                    }
                }
            }
        })
        .await;
        broadcasts.join("\n")
    };

    let _ = ws.close(None).await;
    Ok(answer)
}

/// Cheap probe — runs `version`, returns latency + reply text on success.
pub async fn test_connection(
    profile_id: &str,
    ip: &str,
    port: u16,
    password: &str,
) -> Result<RconTestResult> {
    let started = Instant::now();
    match send_command(profile_id, ip, port, password, "version").await {
        Ok(reply) => Ok(RconTestResult {
            ok: true,
            server_response: Some(reply),
            elapsed_ms: started.elapsed().as_millis() as u64,
        }),
        Err(e) => Ok(RconTestResult {
            ok: false,
            server_response: Some(e.to_string()),
            elapsed_ms: started.elapsed().as_millis() as u64,
        }),
    }
}

/// Run `serverinfo`. Rust returns JSON, but we keep the raw text too in case
/// the server responds with the older textual format.
pub async fn get_server_status(
    profile_id: &str,
    ip: &str,
    port: u16,
    password: &str,
) -> Result<ServerStatus> {
    let raw = send_command(profile_id, ip, port, password, "serverinfo").await?;
    let mut status = ServerStatus {
        raw: raw.clone(),
        ..Default::default()
    };
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_string);
        let u = |k: &str| v.get(k).and_then(|x| x.as_u64()).map(|n| n as u32);
        let f = |k: &str| v.get(k).and_then(|x| x.as_f64()).map(|n| n as f32);
        status.hostname = s("Hostname").or_else(|| s("hostname"));
        status.map = s("Map").or_else(|| s("map"));
        status.players = u("Players").or_else(|| u("players"));
        status.max_players = u("MaxPlayers").or_else(|| u("maxPlayers"));
        status.queued = u("Queued").or_else(|| u("queued"));
        status.joining = u("Joining").or_else(|| u("joining"));
        status.uptime_seconds = v.get("Uptime").and_then(|x| x.as_u64());
        status.framerate = f("Framerate").or_else(|| f("fps"));
    }
    Ok(status)
}

/// Run `banlistex`. Rust answers with a JSON array of bans. Older
/// installs print a CSV-ish text format which we don't try to parse —
/// callers should expect an empty list there and use `Console` instead.
pub async fn get_bans(
    profile_id: &str,
    ip: &str,
    port: u16,
    password: &str,
) -> Result<Vec<BanInfo>> {
    let raw = send_command(profile_id, ip, port, password, "banlistex").await?;
    let v: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Ok(vec![]),
    };
    let Some(arr) = v.as_array() else {
        return Ok(vec![]);
    };
    let mut out = Vec::with_capacity(arr.len());
    for b in arr {
        let s = |k: &str| b.get(k).and_then(|x| x.as_str()).map(str::to_string);
        // SteamID arrives as either a string or a u64 depending on server build.
        let steam_id = s("steamid")
            .or_else(|| s("SteamID"))
            .or_else(|| {
                b.get("steamid")
                    .or_else(|| b.get("SteamID"))
                    .and_then(|x| x.as_u64())
                    .map(|n| n.to_string())
            })
            .unwrap_or_default();
        let name = s("username").or_else(|| s("name")).unwrap_or_default();
        let reason = s("notes").or_else(|| s("reason")).filter(|s| !s.is_empty());
        // expiry is a unix timestamp; 0 means permanent.
        let expires_at = b
            .get("expiry")
            .and_then(|x| x.as_i64())
            .filter(|&t| t > 0)
            .and_then(|t| chrono::DateTime::<chrono::Utc>::from_timestamp(t, 0));
        out.push(BanInfo {
            steam_id,
            name,
            reason,
            expires_at,
        });
    }
    Ok(out)
}

/// Run `playerlist`. Rust answers with a JSON array — we tolerate either
/// `SteamID` or `SteamId` casing and missing fields.
pub async fn get_player_list(
    profile_id: &str,
    ip: &str,
    port: u16,
    password: &str,
) -> Result<Vec<PlayerInfo>> {
    let raw = send_command(profile_id, ip, port, password, "playerlist").await?;
    let v: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Ok(vec![]),
    };
    let Some(arr) = v.as_array() else {
        return Ok(vec![]);
    };
    let mut out = Vec::with_capacity(arr.len());
    for p in arr {
        let s = |k: &str| p.get(k).and_then(|x| x.as_str()).map(str::to_string);
        let u = |k: &str| p.get(k).and_then(|x| x.as_u64());
        out.push(PlayerInfo {
            steam_id: s("SteamID")
                .or_else(|| s("SteamId"))
                .or_else(|| s("steamId"))
                .unwrap_or_default(),
            name: s("DisplayName")
                .or_else(|| s("Name"))
                .or_else(|| s("name"))
                .unwrap_or_else(|| "(unknown)".to_string()),
            ping: u("Ping").map(|n| n as u32),
            connected_seconds: u("ConnectedSeconds").or_else(|| u("connected_seconds")),
            address: s("Address").or_else(|| s("address")),
        });
    }
    Ok(out)
}

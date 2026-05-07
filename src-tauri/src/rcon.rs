//! WebSocket RCON for Rust (Facepunch) game servers.
//!
//! Rust's RCON is *not* the Source-engine TCP protocol. The server hosts a
//! websocket at `ws://<host>:<rcon_port>/<password>` and exchanges JSON frames
//! shaped like `{"Identifier": <i32>, "Message": "<command>", "Name": "<tag>"}`.
//! Responses come back with the same `Identifier`, plus `Message` (text output)
//! and `Type` (e.g. `"Generic"`, `"Warning"`, `"Chat"`). We send a command,
//! wait for the first matching frame, and return its `Message`.

use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

use crate::error::{AppError, Result};
use crate::models::{BanInfo, PlayerInfo, RconTestResult, ServerStatus};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(5);
const CLIENT_NAME: &str = "RustApp";

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
    // Rust accepts the password as a path segment.
    let pw = url::form_urlencoded::byte_serialize(password.as_bytes()).collect::<String>();
    format!("ws://{ip}:{port}/{pw}")
}

/// Connect, send a command, return the first matching response. Connection is
/// closed before returning. Suitable for fire-and-forget commands like
/// `oxide.load`/`oxide.unload`/`oxide.reload`.
pub async fn send_command(ip: &str, port: u16, password: &str, command: &str) -> Result<String> {
    let url = build_url(ip, port, password);
    let (mut ws, _resp) = timeout(CONNECT_TIMEOUT, tokio_tungstenite::connect_async(&url))
        .await
        .map_err(|_| AppError::RconConnectTimeout)??;

    let identifier: i32 = (Instant::now().elapsed().as_micros() & 0x7fff_ffff) as i32;
    let req = RconRequest {
        identifier,
        message: command,
        name: CLIENT_NAME,
    };
    ws.send(Message::Text(serde_json::to_string(&req)?)).await?;

    let answer = timeout(RESPONSE_TIMEOUT, async {
        while let Some(frame) = ws.next().await {
            let msg = frame?;
            if let Message::Text(text) = msg {
                if let Ok(resp) = serde_json::from_str::<RconResponse>(&text) {
                    if resp.identifier == identifier {
                        return Ok::<String, AppError>(resp.message);
                    }
                    // Otherwise this is an unrelated broadcast (chat etc.) — keep reading.
                }
            }
        }
        Err(AppError::RconClosed)
    })
    .await
    .map_err(|_| AppError::RconResponseTimeout)??;

    let _ = ws.close(None).await;
    Ok(answer)
}

/// Cheap probe — runs `version`, returns latency + reply text on success.
pub async fn test_connection(ip: &str, port: u16, password: &str) -> Result<RconTestResult> {
    let started = Instant::now();
    match send_command(ip, port, password, "version").await {
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
pub async fn get_server_status(ip: &str, port: u16, password: &str) -> Result<ServerStatus> {
    let raw = send_command(ip, port, password, "serverinfo").await?;
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
pub async fn get_bans(ip: &str, port: u16, password: &str) -> Result<Vec<BanInfo>> {
    let raw = send_command(ip, port, password, "banlistex").await?;
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
pub async fn get_player_list(ip: &str, port: u16, password: &str) -> Result<Vec<PlayerInfo>> {
    let raw = send_command(ip, port, password, "playerlist").await?;
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

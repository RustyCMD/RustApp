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
use crate::models::RconTestResult;

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
        .map_err(|_| AppError::rcon("connect timed out"))??;

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
        Err(AppError::rcon("connection closed before response"))
    })
    .await
    .map_err(|_| AppError::rcon("response timed out"))??;

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

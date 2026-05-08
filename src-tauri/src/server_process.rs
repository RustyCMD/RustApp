//! Local Rust dedicated server lifecycle.
//!
//! Tracks the spawned `cmd.exe /c start.bat` for each server profile, streams
//! its stdout/stderr back to the frontend via the `server-log` event, and
//! emits `server-state` transitions (`starting` → `running` → `stopped` /
//! `exited`) so the Console tab can update its status pill in real time.
//!
//! Stop is two-phase: try RCON `quit` (graceful save), wait up to 10 s for
//! the child to exit, then force-kill the entire process tree via
//! `taskkill /T /F /PID`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::sleep;

use crate::activity::{self, ActivityStatus};
use crate::database::Db;
use crate::error::{AppError, Result};
use crate::launch_settings;
use crate::models::ServerProfile;
use crate::rcon;

const LOG_EVENT: &str = "server-log";
const STATE_EVENT: &str = "server-state";

/// Tauri-managed state. Keyed by `ServerProfile::id`. Shared across the start
/// command, the background log-pumps, and the wait-for-exit watcher.
#[derive(Default)]
pub struct ServerProcesses(pub Arc<AsyncMutex<HashMap<String, ChildHandle>>>);

pub struct ChildHandle {
    pub pid: u32,
    pub child: Child,
    /// Kept for future "uptime" display; not yet read.
    #[allow(dead_code)]
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogPayload {
    profile_id: String,
    line: String,
    stream: LogStream,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerState {
    Starting,
    Running,
    Stopped,
    Exited,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatePayload {
    profile_id: String,
    state: ServerState,
    /// Process exit code, if applicable (only on `exited`).
    code: Option<i32>,
    /// PID of the spawned cmd.exe, if applicable (only on `running`).
    pid: Option<u32>,
}

fn emit_state(app: &tauri::AppHandle, p: StatePayload) {
    let _ = app.emit(STATE_EVENT, p);
}

fn emit_log(app: &tauri::AppHandle, p: LogPayload) {
    let _ = app.emit(LOG_EVENT, p);
}

#[tauri::command]
pub async fn start_server(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    registry: State<'_, ServerProcesses>,
    profile_id: String,
) -> Result<()> {
    let profile = require_profile(&db, &profile_id)?;
    let dir = PathBuf::from(&profile.server_directory);
    if profile.server_directory.trim().is_empty() || !dir.exists() {
        return Err(AppError::invalid_input(
            "server directory is empty or does not exist",
        ));
    }
    let exe = dir.join("RustDedicated.exe");
    if !exe.exists() {
        return Err(AppError::server_exe_missing(exe.to_string_lossy()));
    }

    {
        let map = registry.0.lock().await;
        if map.contains_key(&profile_id) {
            return Err(AppError::server_already_running(profile.name.clone()));
        }
    }

    // Make sure start.bat exists. If the user never opened the launch-settings
    // form, fall back to defaults; if they have a row in launch_settings, use
    // that. Existing user-edited start.bat files are respected as-is.
    let bat = dir.join("start.bat");
    if !bat.exists() {
        let settings = launch_settings::effective(&db, &profile)?;
        launch_settings::write_start_bat(&profile, &settings).await?;
    }

    emit_state(
        &app,
        StatePayload {
            profile_id: profile_id.clone(),
            state: ServerState::Starting,
            code: None,
            pid: None,
        },
    );

    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "start.bat"])
        .current_dir(&dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    // Hide the console window — RustDedicated.exe inherits this and would
    // otherwise pop a CMD window beside the app.
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn().map_err(|e| {
        // Surface a clean SERVER-003 instead of a raw FS-* code so toasts read well.
        AppError::server_spawn_failed(format!("spawn cmd /c start.bat: {e}"))
    })?;
    let pid = child.id().unwrap_or(0);

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let app_o = app.clone();
    let pid_o = profile_id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_log(
                &app_o,
                LogPayload {
                    profile_id: pid_o.clone(),
                    line,
                    stream: LogStream::Stdout,
                },
            );
        }
    });

    let app_e = app.clone();
    let pid_e = profile_id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            emit_log(
                &app_e,
                LogPayload {
                    profile_id: pid_e.clone(),
                    line,
                    stream: LogStream::Stderr,
                },
            );
        }
    });

    {
        let mut map = registry.0.lock().await;
        map.insert(
            profile_id.clone(),
            ChildHandle {
                pid,
                child,
                started_at: Utc::now(),
            },
        );
    }

    emit_state(
        &app,
        StatePayload {
            profile_id: profile_id.clone(),
            state: ServerState::Running,
            code: None,
            pid: Some(pid),
        },
    );

    let _ = activity::record(
        &db,
        Some(&profile_id),
        "server.start",
        Some(&profile.name),
        ActivityStatus::Ok,
        Some(&format!("pid {pid}")),
    );

    // Watcher: when the child exits on its own (server crashes, RCON quit
    // with no Stop click, or post-Stop wait completes) we want to update the
    // registry + frontend without holding the caller hostage.
    let app_w = app.clone();
    let registry_w = registry.0.clone();
    let pid_w = profile_id.clone();
    tokio::spawn(async move {
        // Wait for the child handle to leave the registry (Stop) or for the
        // child to exit on its own. We poll the registry's child via try_wait.
        loop {
            sleep(Duration::from_millis(500)).await;
            let mut map = registry_w.lock().await;
            let Some(handle) = map.get_mut(&pid_w) else {
                // Removed by stop_server — it has already emitted Stopped.
                return;
            };
            match handle.child.try_wait() {
                Ok(Some(status)) => {
                    let code = status.code();
                    map.remove(&pid_w);
                    drop(map);
                    emit_state(
                        &app_w,
                        StatePayload {
                            profile_id: pid_w.clone(),
                            state: ServerState::Exited,
                            code,
                            pid: None,
                        },
                    );
                    return;
                }
                Ok(None) => {
                    // Still running — keep polling.
                }
                Err(_) => {
                    // Couldn't query — drop the entry so we don't deadlock the user.
                    map.remove(&pid_w);
                    drop(map);
                    emit_state(
                        &app_w,
                        StatePayload {
                            profile_id: pid_w.clone(),
                            state: ServerState::Exited,
                            code: None,
                            pid: None,
                        },
                    );
                    return;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_server(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    registry: State<'_, ServerProcesses>,
    profile_id: String,
) -> Result<()> {
    let pid = {
        let map = registry.0.lock().await;
        map.get(&profile_id).map(|h| h.pid)
    };
    let Some(pid) = pid else {
        // Nothing to stop — make this a no-op so the UI doesn't have to guard.
        return Ok(());
    };

    let profile = require_profile(&db, &profile_id)?;

    // Phase 1: graceful — fire-and-forget RCON quit. If the server isn't
    // RCON-ready (just started, wrong password, etc.) we'll still fall
    // through to the kill below.
    let _ = rcon::send_command(
        &profile.ip_address,
        profile.rcon_port,
        &profile.rcon_password,
        "quit",
    )
    .await;

    // Phase 2: poll for graceful exit, up to 10 s.
    let exited_gracefully = wait_for_exit(&registry, &profile_id, Duration::from_secs(10)).await;

    if !exited_gracefully {
        // Phase 3: force kill the whole process tree (cmd.exe + RustDedicated.exe).
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
        // Give Windows a beat to actually clean up.
        let _ = wait_for_exit(&registry, &profile_id, Duration::from_secs(3)).await;
    }

    // Final cleanup — drop the entry no matter what.
    {
        let mut map = registry.0.lock().await;
        map.remove(&profile_id);
    }

    emit_state(
        &app,
        StatePayload {
            profile_id: profile_id.clone(),
            state: ServerState::Stopped,
            code: None,
            pid: None,
        },
    );

    let _ = activity::record(
        &db,
        Some(&profile_id),
        "server.stop",
        Some(&profile.name),
        ActivityStatus::Ok,
        Some(if exited_gracefully { "rcon quit" } else { "force-killed" }),
    );

    Ok(())
}

#[tauri::command]
pub async fn get_running_servers(registry: State<'_, ServerProcesses>) -> Result<Vec<String>> {
    let map = registry.0.lock().await;
    Ok(map.keys().cloned().collect())
}

/// Poll the registry's `child.try_wait()` for up to `timeout`. Returns true
/// if the child reported exit (and removes the entry); false on timeout.
async fn wait_for_exit(
    registry: &State<'_, ServerProcesses>,
    profile_id: &str,
    timeout: Duration,
) -> bool {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        {
            let mut map = registry.0.lock().await;
            let Some(handle) = map.get_mut(profile_id) else {
                return true;
            };
            if let Ok(Some(_status)) = handle.child.try_wait() {
                map.remove(profile_id);
                return true;
            }
        }
        sleep(Duration::from_millis(250)).await;
    }
    false
}

fn require_profile(db: &State<'_, Db>, id: &str) -> Result<ServerProfile> {
    db.get_profile_by_id(id)?
        .ok_or_else(|| AppError::profile_not_found(id.to_string()))
}

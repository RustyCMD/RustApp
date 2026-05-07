//! One-click local Rust dedicated server install.
//!
//! Pipeline (each step preceded by a `Stage` event on the
//! `install-progress` channel):
//!
//!   1. Prepare         — validate / create the install dir
//!   2. DownloadSteamcmd — fetch steamcmd.zip from Valve's CDN
//!   3. ExtractSteamcmd  — unzip into `<dir>/steamcmd/`
//!   4. RunSteamcmd      — `+force_install_dir … +app_update 258550 validate +quit`
//!   5. Verify           — assert `RustDedicated.exe` exists
//!   6. OxideDownload    — *(optional)* fetch the latest Oxide.Rust release
//!   7. OxideExtract     — *(optional)* overlay the Oxide zip onto the install
//!   8. OxideDirs        — make sure `oxide/{plugins,plugins/disabled,config}` exist
//!   9. RegisterProfile  — insert a `ServerProfile` row so the new server
//!                         appears everywhere else in the app
//!
//! Oxide failure is downgraded to a `Warning` event — the vanilla server is
//! already on disk and usable, so we still create the profile and just note
//! the failure on it.

use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;

use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex as AsyncMutex;

use crate::activity::{self, ActivityStatus};
use crate::database::Db;
use crate::models::{ServerProfile, ServerProfileInput};
use crate::utils;

const STEAMCMD_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
const RUST_APPID: &str = "258550";
const OXIDE_URL: &str = "https://umod.org/games/rust/download";
const EVENT: &str = "install-progress";

/// Local HTTP client. Kept separate from `umod_scraper`'s client because the
/// timeouts and headers are different — SteamCMD/Oxide downloads can take
/// minutes, the uMod JSON API is sub-second.
static HTTP: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .user_agent(concat!("RustApp/", env!("CARGO_PKG_VERSION")))
        .gzip(true)
        // SteamCMD's zip is small but Oxide.Rust can be tens of MB and the
        // overall request might queue behind a slow connection.
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .expect("reqwest client (installer)")
});

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallArgs {
    pub name: String,
    pub install_dir: String,
    pub install_oxide: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallStage {
    Prepare,
    DownloadSteamcmd,
    ExtractSteamcmd,
    RunSteamcmd,
    Verify,
    OxideDownload,
    OxideExtract,
    OxideDirs,
    RegisterProfile,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

/// Event payload. Internally tagged so the TS side can do
/// `if (ev.kind === "log") …`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum InstallProgress {
    Stage { stage: InstallStage, message: String },
    Log { line: String, stream: LogStream },
    Done { profile_id: String },
    Error { stage: InstallStage, message: String },
    /// Non-fatal: surfaced for things like "Oxide failed to install but the
    /// vanilla server is fine".
    Warning { stage: InstallStage, message: String },
}

fn emit(app: &tauri::AppHandle, ev: InstallProgress) {
    // Best-effort. Frontend may not be listening (page unmounted) — that's
    // fine; the store-side listener is registered at app startup.
    let _ = app.emit(EVENT, ev);
}

fn stage(app: &tauri::AppHandle, s: InstallStage, message: impl Into<String>) {
    emit(app, InstallProgress::Stage { stage: s, message: message.into() });
}

fn log_line(app: &tauri::AppHandle, line: String, stream: LogStream) {
    emit(app, InstallProgress::Log { line, stream });
}

#[tauri::command]
pub async fn install_rust_server(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    args: InstallArgs,
) -> Result<ServerProfile, String> {
    // We translate any internal failure into both a final `Error` event and
    // a `Result::Err` so the frontend can `await invoke(...)` if it wants.
    match run(&app, &db, args.clone()).await {
        Ok(profile) => {
            emit(&app, InstallProgress::Done { profile_id: profile.id.clone() });
            Ok(profile)
        }
        Err((failed_stage, msg)) => {
            emit(&app, InstallProgress::Error { stage: failed_stage, message: msg.clone() });
            let _ = activity::record(
                &db,
                None,
                "install.fail",
                Some(&args.name),
                ActivityStatus::Error,
                Some(&msg),
            );
            Err(msg)
        }
    }
}

type StageErr = (InstallStage, String);

fn err(s: InstallStage, e: impl ToString) -> StageErr {
    (s, e.to_string())
}

async fn run(
    app: &tauri::AppHandle,
    db: &Db,
    args: InstallArgs,
) -> Result<ServerProfile, StageErr> {
    let install_dir = PathBuf::from(&args.install_dir);
    let name = args.name.trim().to_string();
    if name.is_empty() {
        return Err(err(InstallStage::Prepare, "Server name is required."));
    }
    if args.install_dir.trim().is_empty() {
        return Err(err(InstallStage::Prepare, "Install directory is required."));
    }

    // ── 1. Prepare ─────────────────────────────────────────────────────────
    stage(app, InstallStage::Prepare, "Preparing install directory");
    tokio::fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| err(InstallStage::Prepare, format!("create dir: {e}")))?;

    let already_installed = install_dir.join("RustDedicated.exe").exists();

    // Reject non-empty unrelated dirs so we don't dump SteamCMD into the
    // user's Documents folder. Allow our own scaffolding (a previous
    // partial run leaves `steamcmd/`, `RustDedicated_Data/`, `oxide/`
    // behind — re-running the install over those is fine and expected).
    if !already_installed {
        let mut entries = tokio::fs::read_dir(&install_dir)
            .await
            .map_err(|e| err(InstallStage::Prepare, format!("read dir: {e}")))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| err(InstallStage::Prepare, format!("read dir: {e}")))?
        {
            let name = entry.file_name();
            let s = name.to_string_lossy();
            let known = matches!(
                s.as_ref(),
                "steamcmd"
                    | "RustDedicated.exe"
                    | "RustDedicated_Data"
                    | "oxide"
                    | "server"
                    | "logs"
                    | "Bundles"
                    | "Managed"
            );
            if !known {
                return Err(err(
                    InstallStage::Prepare,
                    "Install directory is not empty and doesn't look like an existing Rust server. \
                     Pick an empty folder or an existing install.",
                ));
            }
        }
    }

    let steamcmd_root = install_dir.join("steamcmd");
    tokio::fs::create_dir_all(&steamcmd_root)
        .await
        .map_err(|e| err(InstallStage::Prepare, format!("create steamcmd dir: {e}")))?;
    let steamcmd_exe = steamcmd_root.join("steamcmd.exe");

    // ── 2 & 3. SteamCMD download + extract (skip if already there) ─────────
    if !steamcmd_exe.exists() {
        stage(app, InstallStage::DownloadSteamcmd, "Downloading SteamCMD");
        let zip_bytes = HTTP
            .get(STEAMCMD_URL)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| err(InstallStage::DownloadSteamcmd, format!("download: {e}")))?
            .bytes()
            .await
            .map_err(|e| err(InstallStage::DownloadSteamcmd, format!("download body: {e}")))?;

        stage(app, InstallStage::ExtractSteamcmd, "Extracting SteamCMD");
        extract_zip(&zip_bytes, &steamcmd_root)
            .map_err(|e| err(InstallStage::ExtractSteamcmd, format!("extract: {e}")))?;

        if !steamcmd_exe.exists() {
            return Err(err(
                InstallStage::ExtractSteamcmd,
                "SteamCMD zip did not contain steamcmd.exe.",
            ));
        }
    } else {
        log_line(
            app,
            "[install] steamcmd.exe already present — skipping download.".into(),
            LogStream::Stdout,
        );
    }

    // ── 4. Run SteamCMD ────────────────────────────────────────────────────
    stage(
        app,
        InstallStage::RunSteamcmd,
        "Running SteamCMD (this can take several minutes)",
    );

    // SteamCMD wants an absolute path; canonicalize to avoid surprises with
    // relative bits. Fall back to the original if canonicalize fails (shouldn't,
    // since we just created the dir).
    let install_dir_str = install_dir
        .canonicalize()
        .unwrap_or_else(|_| install_dir.clone())
        .to_string_lossy()
        .to_string();

    let mut cmd = Command::new(&steamcmd_exe);
    cmd.args([
        "+force_install_dir",
        install_dir_str.as_str(),
        "+login",
        "anonymous",
        "+app_update",
        RUST_APPID,
        "validate",
        "+quit",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    // Suppress the SteamCMD console window on Windows. Without this, a CMD
    // window pops up alongside the app even though we pipe stdio.
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let mut child = cmd
        .spawn()
        .map_err(|e| err(InstallStage::RunSteamcmd, format!("spawn steamcmd: {e}")))?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    // Keep the last 20 stderr lines so an error event can quote them.
    let stderr_tail: Arc<AsyncMutex<Vec<String>>> =
        Arc::new(AsyncMutex::new(Vec::with_capacity(20)));

    let app_o = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log_line(&app_o, line, LogStream::Stdout);
        }
    });
    let app_e = app.clone();
    let tail = stderr_tail.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            {
                let mut t = tail.lock().await;
                if t.len() >= 20 {
                    t.remove(0);
                }
                t.push(line.clone());
            }
            log_line(&app_e, line, LogStream::Stderr);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| err(InstallStage::RunSteamcmd, format!("await steamcmd: {e}")))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if !status.success() {
        let tail = stderr_tail.lock().await.join("\n");
        return Err(err(
            InstallStage::RunSteamcmd,
            format!(
                "SteamCMD exited with code {}.\n{}",
                status
                    .code()
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "?".into()),
                tail,
            ),
        ));
    }

    // ── 5. Verify ──────────────────────────────────────────────────────────
    stage(app, InstallStage::Verify, "Verifying RustDedicated.exe");
    if !install_dir.join("RustDedicated.exe").exists() {
        return Err(err(
            InstallStage::Verify,
            "SteamCMD finished but RustDedicated.exe was not created.",
        ));
    }

    // ── 6 & 7. Oxide (optional, non-fatal on failure) ──────────────────────
    let mut oxide_warning: Option<String> = None;
    if args.install_oxide {
        if let Err((failed_stage, msg)) = install_oxide(app, &install_dir).await {
            let warn = format!(
                "Oxide install failed at {failed_stage:?}: {msg}. The Rust server is installed; \
                 you can install Oxide manually later."
            );
            emit(
                app,
                InstallProgress::Warning {
                    stage: failed_stage,
                    message: warn.clone(),
                },
            );
            oxide_warning = Some(warn);
        }
    }

    // ── 8. Oxide directory layout ──────────────────────────────────────────
    stage(app, InstallStage::OxideDirs, "Preparing oxide/ folders");
    for d in [
        utils::enabled_plugins_dir(&args.install_dir),
        utils::disabled_plugins_dir(&args.install_dir),
        utils::config_dir(&args.install_dir),
    ] {
        tokio::fs::create_dir_all(&d).await.map_err(|e| {
            err(InstallStage::OxideDirs, format!("create {}: {e}", d.display()))
        })?;
    }

    // ── 9. Register profile ────────────────────────────────────────────────
    stage(
        app,
        InstallStage::RegisterProfile,
        "Registering server with RustApp",
    );
    let profile = db
        .insert_profile(ServerProfileInput {
            name: name.clone(),
            ip_address: "127.0.0.1".into(),
            rcon_port: 28016,
            rcon_password: String::new(),
            server_directory: args.install_dir.clone(),
            notes: oxide_warning.as_ref().map(|w| format!("Note: {w}")),
        })
        .map_err(|e| err(InstallStage::RegisterProfile, format!("DB insert: {e}")))?;

    let _ = activity::record(
        db,
        Some(&profile.id),
        "install.complete",
        Some(&name),
        ActivityStatus::Ok,
        oxide_warning.as_deref(),
    );

    Ok(profile)
}

async fn install_oxide(app: &tauri::AppHandle, install_dir: &Path) -> Result<(), StageErr> {
    stage(app, InstallStage::OxideDownload, "Downloading latest Oxide.Rust");
    let bytes = HTTP
        .get(OXIDE_URL)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| err(InstallStage::OxideDownload, format!("download: {e}")))?
        .bytes()
        .await
        .map_err(|e| err(InstallStage::OxideDownload, format!("download body: {e}")))?;

    stage(
        app,
        InstallStage::OxideExtract,
        "Extracting Oxide over server install",
    );
    extract_zip(&bytes, install_dir)
        .map_err(|e| err(InstallStage::OxideExtract, format!("extract: {e}")))?;
    Ok(())
}

/// Extract `zip_bytes` into `dest`, preserving in-zip directory structure
/// and overwriting existing files. Uses `enclosed_name` to refuse paths
/// that would escape `dest` (zip-slip).
fn extract_zip(zip_bytes: &[u8], dest: &Path) -> std::io::Result<()> {
    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        let Some(rel) = file.enclosed_name().map(|p| p.to_owned()) else {
            continue;
        };
        let out_path = dest.join(&rel);
        if file.is_dir() {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut outfile = std::fs::File::create(&out_path)?;
        std::io::copy(&mut file, &mut outfile)?;
    }
    Ok(())
}

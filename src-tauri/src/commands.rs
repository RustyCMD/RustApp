//! Tauri command surface — every function here is callable from the
//! frontend via `invoke("<name>", { ... })`. Command names are snake_case
//! to match Tauri's default and our `tauriCommands.ts` wrappers.

use std::time::Instant;

use tauri::State;

use crate::activity::{self, ActivityEntry, ActivityStatus};
use crate::config_files;
use crate::database::Db;
use crate::dependencies;
use crate::error::{AppError, Result};
use crate::models::{
    BulkUpdateFailure, BulkUpdateResult, ConfigBackup, ConfigKind, DependencyStatus,
    InstalledPlugin, PlayerInfo, PluginMetaData, PluginStorePage, PluginUpdateInfo,
    RconCommandResult, RconTestResult, ServerProfile, ServerProfileInput, ServerStatus,
};
use crate::plugins;
use crate::rcon;
use crate::umod_scraper;
use crate::utils;

// ---------------------------------------------------------------------------
//  Server profiles
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn add_server_profile(db: State<'_, Db>, profile: ServerProfileInput) -> Result<ServerProfile> {
    db.insert_profile(profile)
}

#[tauri::command]
pub fn update_server_profile(
    db: State<'_, Db>,
    profile: ServerProfile,
) -> Result<ServerProfile> {
    db.update_profile(profile)
}

#[tauri::command]
pub fn delete_server_profile(db: State<'_, Db>, id: String) -> Result<()> {
    db.delete_profile(&id)
}

#[tauri::command]
pub fn get_server_profiles(db: State<'_, Db>) -> Result<Vec<ServerProfile>> {
    db.get_all_profiles()
}

#[tauri::command]
pub fn get_server_profile(db: State<'_, Db>, id: String) -> Result<ServerProfile> {
    db.get_profile_by_id(&id)?
        .ok_or_else(|| AppError::not_found(format!("profile {id}")))
}

#[tauri::command]
pub async fn test_rcon_connection(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<RconTestResult> {
    let p = require_profile(&db, &profile_id)?;
    let r = rcon::test_connection(&p.ip_address, p.rcon_port, &p.rcon_password).await?;
    let _ = activity::record(
        &db,
        Some(&profile_id),
        "rcon.test",
        Some(&p.name),
        if r.ok { ActivityStatus::Ok } else { ActivityStatus::Error },
        r.server_response.as_deref(),
    );
    Ok(r)
}

#[tauri::command]
pub async fn send_rcon_command(
    db: State<'_, Db>,
    profile_id: String,
    command: String,
) -> Result<RconCommandResult> {
    let p = require_profile(&db, &profile_id)?;
    let started = Instant::now();
    let response = rcon::send_command(&p.ip_address, p.rcon_port, &p.rcon_password, &command).await?;
    let elapsed_ms = started.elapsed().as_millis() as u64;
    let _ = activity::record(
        &db,
        Some(&profile_id),
        "rcon.command",
        Some(&command),
        ActivityStatus::Ok,
        Some(&truncate(&response, 200)),
    );
    Ok(RconCommandResult {
        command,
        response,
        elapsed_ms,
    })
}

#[tauri::command]
pub async fn get_server_status(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<ServerStatus> {
    let p = require_profile(&db, &profile_id)?;
    rcon::get_server_status(&p.ip_address, p.rcon_port, &p.rcon_password).await
}

#[tauri::command]
pub async fn get_player_list(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<Vec<PlayerInfo>> {
    let p = require_profile(&db, &profile_id)?;
    rcon::get_player_list(&p.ip_address, p.rcon_port, &p.rcon_password).await
}

// ---------------------------------------------------------------------------
//  Installed plugins
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_installed_plugins(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<Vec<InstalledPlugin>> {
    let p = require_profile(&db, &profile_id)?;
    plugins::get_installed_plugins(&p.server_directory).await
}

#[tauri::command]
pub async fn enable_plugin(
    db: State<'_, Db>,
    profile_id: String,
    plugin_name: String,
) -> Result<()> {
    let p = require_profile(&db, &profile_id)?;
    plugins::enable_plugin(&p.server_directory, &plugin_name).await?;
    // Best-effort live reload.
    let _ = rcon::send_command(
        &p.ip_address,
        p.rcon_port,
        &p.rcon_password,
        &format!("oxide.load {plugin_name}"),
    )
    .await;
    Ok(())
}

#[tauri::command]
pub async fn disable_plugin(
    db: State<'_, Db>,
    profile_id: String,
    plugin_name: String,
) -> Result<()> {
    let p = require_profile(&db, &profile_id)?;
    let _ = rcon::send_command(
        &p.ip_address,
        p.rcon_port,
        &p.rcon_password,
        &format!("oxide.unload {plugin_name}"),
    )
    .await;
    plugins::disable_plugin(&p.server_directory, &plugin_name).await?;
    Ok(())
}

#[tauri::command]
pub async fn reload_plugin(
    db: State<'_, Db>,
    profile_id: String,
    plugin_name: String,
) -> Result<String> {
    let p = require_profile(&db, &profile_id)?;
    rcon::send_command(
        &p.ip_address,
        p.rcon_port,
        &p.rcon_password,
        &format!("oxide.reload {plugin_name}"),
    )
    .await
}

#[tauri::command]
pub async fn uninstall_plugin(
    db: State<'_, Db>,
    profile_id: String,
    plugin_name: String,
    delete_config: bool,
) -> Result<Vec<String>> {
    let p = require_profile(&db, &profile_id)?;
    let _ = rcon::send_command(
        &p.ip_address,
        p.rcon_port,
        &p.rcon_password,
        &format!("oxide.unload {plugin_name}"),
    )
    .await;
    let removed = plugins::uninstall_plugin(&p.server_directory, &plugin_name, delete_config).await?;
    let paths: Vec<String> = removed
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    let _ = activity::record(
        &db,
        Some(&profile_id),
        "plugin.uninstall",
        Some(&plugin_name),
        ActivityStatus::Ok,
        Some(&format!("removed {} file(s)", paths.len())),
    );
    Ok(paths)
}

// ---------------------------------------------------------------------------
//  Plugin configs
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn load_plugin_config(
    db: State<'_, Db>,
    profile_id: String,
    plugin_name: String,
    config_kind: ConfigKind,
) -> Result<String> {
    let p = require_profile(&db, &profile_id)?;
    let (_path, content) = config_files::load(&p.server_directory, &plugin_name, config_kind).await?;
    Ok(content)
}

#[tauri::command]
pub async fn save_plugin_config(
    db: State<'_, Db>,
    profile_id: String,
    plugin_name: String,
    config_kind: ConfigKind,
    content: String,
) -> Result<()> {
    let p = require_profile(&db, &profile_id)?;
    config_files::save(&p.server_directory, &plugin_name, config_kind, &content).await?;
    let _ = activity::record(
        &db,
        Some(&profile_id),
        "config.save",
        Some(&plugin_name),
        ActivityStatus::Ok,
        Some(&format!("{} bytes", content.len())),
    );
    Ok(())
}

#[tauri::command]
pub async fn list_config_backups(
    db: State<'_, Db>,
    profile_id: String,
    plugin_name: String,
) -> Result<Vec<ConfigBackup>> {
    let p = require_profile(&db, &profile_id)?;
    config_files::list_backups(&p.server_directory, &plugin_name).await
}

// ---------------------------------------------------------------------------
//  Plugin store / install
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fetch_umod_plugins(
    db: State<'_, Db>,
    page: u32,
    search: Option<String>,
) -> Result<PluginStorePage> {
    let result = umod_scraper::fetch_page(page, search.as_deref()).await?;
    if !result.items.is_empty() {
        // Best-effort cache write — never fail the request because of cache IO.
        if let Err(e) = db.upsert_umod_cache(&result.items) {
            log::warn!("umod cache write failed: {e}");
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn list_cached_umod_plugins(db: State<'_, Db>) -> Result<Vec<PluginMetaData>> {
    db.list_umod_cache()
}

#[tauri::command]
pub async fn install_plugin(
    db: State<'_, Db>,
    profile_id: String,
    plugin_slug: String,
) -> Result<InstalledPlugin> {
    let p = require_profile(&db, &profile_id)?;
    let meta = db
        .get_umod_by_slug(&plugin_slug)?
        .ok_or_else(|| AppError::not_found(format!("plugin {plugin_slug} not in cache")))?;
    let url = meta
        .download_url
        .as_deref()
        .ok_or_else(|| AppError::invalid_input("plugin has no download_url"))?;

    let bytes = umod_scraper::download_plugin(url).await?;
    let plugin_name = meta.name.clone();
    let path = plugins::install_plugin_file(&p.server_directory, &plugin_name, &bytes).await?;

    let _ = rcon::send_command(
        &p.ip_address,
        p.rcon_port,
        &p.rcon_password,
        &format!("oxide.load {plugin_name}"),
    )
    .await;

    Ok(InstalledPlugin {
        name: plugin_name,
        author: meta.author,
        version: meta.version,
        description: meta.description,
        file_path: path.to_string_lossy().into_owned(),
        enabled: true,
        has_config: false,
    })
}

// ---------------------------------------------------------------------------
//  Update notifications
// ---------------------------------------------------------------------------

/// Apply every available update for the active server. Failures are
/// collected — a single bad plugin doesn't abort the run.
#[tauri::command]
pub async fn update_all_plugins(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<BulkUpdateResult> {
    let p = require_profile(&db, &profile_id)?;
    let updates = compute_pending_updates(&db, &p).await?;

    let mut updated = Vec::new();
    let mut failed = Vec::new();

    for u in updates {
        let Some(url) = u.download_url.clone() else {
            failed.push(BulkUpdateFailure {
                plugin_name: u.plugin_name.clone(),
                error: "no download_url".into(),
            });
            continue;
        };

        let result = async {
            let bytes = umod_scraper::download_plugin(&url).await?;
            plugins::install_plugin_file(&p.server_directory, &u.plugin_name, &bytes).await?;
            let _ = rcon::send_command(
                &p.ip_address,
                p.rcon_port,
                &p.rcon_password,
                &format!("oxide.reload {}", u.plugin_name),
            )
            .await;
            Ok::<(), AppError>(())
        }
        .await;

        match result {
            Ok(()) => updated.push(u.plugin_name),
            Err(e) => failed.push(BulkUpdateFailure {
                plugin_name: u.plugin_name,
                error: e.to_string(),
            }),
        }
    }

    let _ = activity::record(
        &db,
        Some(&profile_id),
        "plugin.update_all",
        None,
        if failed.is_empty() { ActivityStatus::Ok } else { ActivityStatus::Info },
        Some(&format!(
            "{} updated, {} failed",
            updated.len(),
            failed.len()
        )),
    );

    Ok(BulkUpdateResult { updated, failed })
}

#[tauri::command]
pub async fn check_for_plugin_updates(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<Vec<PluginUpdateInfo>> {
    let p = require_profile(&db, &profile_id)?;
    compute_pending_updates(&db, &p).await
}

async fn compute_pending_updates(db: &Db, p: &ServerProfile) -> Result<Vec<PluginUpdateInfo>> {
    let installed = plugins::get_installed_plugins(&p.server_directory).await?;
    let cache = db.list_umod_cache()?;

    let mut out = Vec::new();
    for inst in installed {
        let Some(installed_v) = inst.version.as_deref() else {
            continue;
        };
        let cached = cache
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(&inst.name));
        let Some(cached) = cached else { continue };
        let Some(latest_v) = cached.version.as_deref() else {
            continue;
        };
        if utils::is_update_available(installed_v, latest_v) {
            out.push(PluginUpdateInfo {
                plugin_name: inst.name,
                installed_version: Some(installed_v.to_string()),
                latest_version: Some(latest_v.to_string()),
                download_url: cached.download_url.clone(),
            });
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
//  Dependencies
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_common_dependencies(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<DependencyStatus> {
    let p = require_profile(&db, &profile_id)?;
    dependencies::check_common_dependencies(&p.server_directory).await
}

// ---------------------------------------------------------------------------
//  Activity log
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_activity(db: State<'_, Db>, limit: Option<u32>) -> Result<Vec<ActivityEntry>> {
    activity::list(&db, limit.unwrap_or(200))
}

#[tauri::command]
pub fn clear_activity(db: State<'_, Db>) -> Result<()> {
    activity::clear(&db)
}

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------

fn require_profile(db: &State<'_, Db>, id: &str) -> Result<ServerProfile> {
    db.get_profile_by_id(id)?
        .ok_or_else(|| AppError::not_found(format!("profile {id}")))
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

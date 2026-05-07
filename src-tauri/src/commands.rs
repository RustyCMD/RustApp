//! Tauri command surface — every function here is callable from the
//! frontend via `invoke("<name>", { ... })`. Command names are snake_case
//! to match Tauri's default and our `tauriCommands.ts` wrappers.

use tauri::State;

use crate::config_files;
use crate::database::Db;
use crate::dependencies;
use crate::error::{AppError, Result};
use crate::models::{
    ConfigKind, DependencyStatus, InstalledPlugin, PluginMetaData, PluginStorePage,
    PluginUpdateInfo, RconTestResult, ServerProfile, ServerProfileInput,
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
    rcon::test_connection(&p.ip_address, p.rcon_port, &p.rcon_password).await
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
    Ok(())
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

#[tauri::command]
pub async fn check_for_plugin_updates(
    db: State<'_, Db>,
    profile_id: String,
) -> Result<Vec<PluginUpdateInfo>> {
    let p = require_profile(&db, &profile_id)?;
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
//  helpers
// ---------------------------------------------------------------------------

fn require_profile(db: &State<'_, Db>, id: &str) -> Result<ServerProfile> {
    db.get_profile_by_id(id)?
        .ok_or_else(|| AppError::not_found(format!("profile {id}")))
}

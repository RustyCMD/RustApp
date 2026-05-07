//! Library entry. `main.rs` is a thin wrapper that calls [`run`] so we get
//! the same code path on every platform (including mobile, where Tauri 2
//! generates a `start` C symbol from the `tauri::mobile_entry_point`).

mod commands;
mod config_files;
mod database;
mod dependencies;
mod error;
mod models;
mod plugins;
mod rcon;
mod umod_scraper;
mod utils;

use database::Db;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Surface logs from `log::*` macros in development.
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Stash our SQLite connection in app state. The DB lives next to
            // the app's other config under the platform's app-data dir.
            let data_dir = app
                .path()
                .app_data_dir()
                .or_else(|_| app.path().app_config_dir())
                .unwrap_or_else(|_| std::env::temp_dir().join("rustapp"));
            std::fs::create_dir_all(&data_dir)?;
            let db = Db::open(&data_dir.join("rustapp.sqlite"))?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // profiles
            commands::add_server_profile,
            commands::update_server_profile,
            commands::delete_server_profile,
            commands::get_server_profiles,
            commands::get_server_profile,
            commands::test_rcon_connection,
            // installed plugins
            commands::get_installed_plugins,
            commands::enable_plugin,
            commands::disable_plugin,
            commands::reload_plugin,
            // configs
            commands::load_plugin_config,
            commands::save_plugin_config,
            // store
            commands::fetch_umod_plugins,
            commands::list_cached_umod_plugins,
            commands::install_plugin,
            // updates / deps
            commands::check_for_plugin_updates,
            commands::check_common_dependencies,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

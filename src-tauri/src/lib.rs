//! Library entry. `main.rs` is a thin wrapper that calls [`run`] so we get
//! the same code path on every platform (including mobile, where Tauri 2
//! generates a `start` C symbol from the `tauri::mobile_entry_point`).

mod activity;
mod commands;
mod config_files;
mod database;
mod dependencies;
mod error;
mod installer;
mod launch_settings;
mod models;
mod plugins;
mod rcon;
mod saved_commands;
mod server_process;
mod umod_scraper;
mod utils;
mod wipe_schedule;

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
            activity::migrate(&db)?;
            saved_commands::migrate(&db)?;
            wipe_schedule::migrate(&db)?;
            launch_settings::migrate(&db)?;
            app.manage(db);
            app.manage(server_process::ServerProcesses::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // profiles + RCON
            commands::add_server_profile,
            commands::update_server_profile,
            commands::delete_server_profile,
            commands::get_server_profiles,
            commands::get_server_profile,
            commands::test_rcon_connection,
            commands::send_rcon_command,
            commands::get_server_status,
            commands::get_player_list,
            commands::get_bans,
            commands::unban_player,
            // installed plugins
            commands::get_installed_plugins,
            commands::enable_plugin,
            commands::disable_plugin,
            commands::reload_plugin,
            commands::uninstall_plugin,
            commands::install_local_plugin,
            // wipe schedule
            commands::get_wipe_schedule,
            commands::set_wipe_schedule,
            commands::mark_wiped_now,
            commands::delete_wipe_schedule,
            // configs
            commands::load_plugin_config,
            commands::save_plugin_config,
            commands::list_config_backups,
            commands::read_config_backup,
            commands::restore_config_backup,
            // store
            commands::fetch_umod_plugins,
            commands::list_cached_umod_plugins,
            commands::install_plugin,
            // updates / deps
            commands::check_for_plugin_updates,
            commands::update_all_plugins,
            commands::check_common_dependencies,
            // activity log
            commands::list_activity,
            commands::clear_activity,
            // saved RCON commands
            commands::list_saved_commands,
            commands::add_saved_command,
            commands::delete_saved_command,
            // profile import/export
            commands::export_profiles_to_path,
            commands::import_profiles_from_path,
            // local server install
            installer::install_rust_server,
            // launch settings (per-profile start.bat parameters)
            commands::get_launch_settings,
            commands::save_launch_settings,
            commands::regenerate_start_bat,
            commands::delete_launch_settings,
            // local server process lifecycle
            server_process::start_server,
            server_process::stop_server,
            server_process::get_running_servers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

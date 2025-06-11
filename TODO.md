# Building a Rust Mod & Plugin Manager with Tauri & React: A Step-by-Step Guide

## Project Goal: Create a desktop application to simplify the discovery, installation, update, and management of server-side uMod (Oxide) plugins for Rust game servers.

---

## Step 1: Project Setup & Initialization

1.  **Initialize Tauri Project:**
    *   Use the Tauri CLI to create a new project.
    *   Choose `react-ts` as the frontend template.
    *   `cargo tauri init`
    *   Configure `tauri.conf.json`: Set app name, window size, etc.
2.  **Install Rust Dependencies (in `src-tauri/Cargo.toml`):**
    *   Add `rusqlite` for SQLite database interaction.
    *   Add `reqwest` for HTTP requests (async).
    *   Add `tokio` with `fs` feature for asynchronous file operations.
    *   Add `serde` and `serde_json` for serialization/deserialization.
    *   Add `ini` or `config` for INI parsing.
    *   Add a suitable RCON client crate (e.g., `rcon-client`).
    *   Add `semver` for version comparison.
    *   Add `scraper` for HTML parsing (if scraping uMod).
    *   Ensure `tauri` and `tauri-build` are configured correctly.
3.  **Install Frontend Dependencies (in `src/package.json`):**
    *   Ensure `react`, `react-dom`, `typescript` are present.
    *   Add any UI library (optional, e.g., Tailwind CSS, Material UI).
    *   Add `@tauri-apps/api` for communication with the Rust backend.

---

## Step 2: Establish Core Structure & Communication

1.  **Define Data Models (in `src-tauri/src/models.rs`):**
    *   Create Rust structs for data shared between backend and frontend, e.g.:
        *   `ServerProfile` (id, name, ip_address, rcon_port, rcon_password, server_directory)
        *   `PluginMetaData` (name, author, version, description, download_link, last_updated)
        *   `InstalledPlugin` (name, version, author, file_path, enabled_status)
    *   Derive `serde::Serialize` and `serde::Deserialize` for these structs to allow Tauri command communication.
2.  **Setup Tauri Commands Module (in `src-tauri/src/commands.rs`):**
    *   This file will hold functions exposed to the frontend.
    *   Each function should be marked with `#[tauri::command]`.
    *   These functions will call into other backend modules (`database.rs`, `rcon.rs`, `utils.rs`).
3.  **Initialize Tauri App (in `src-tauri/src/main.rs`):**
    *   Import the commands defined in `commands.rs`.
    *   Call `.invoke_handler(tauri::generate_handler![...])` in the `tauri::Builder` to register your commands.
    *   Set up the main window.
4.  **Create Frontend API Layer (in `src/src/api/tauriCommands.ts`):**
    *   Create TypeScript functions that wrap calls to `@tauri-apps/api/tauri`.
    *   Use `invoke('command_name', { argName: argValue })` to call Rust commands.
    *   Define TypeScript interfaces corresponding to your Rust models.
5.  **Basic Frontend App Structure (in `src/src/App.tsx`, `src/src/main.tsx`):**
    *   Set up React Router for navigation between pages (e.g., Dashboard, Plugin Store, Settings).
    *   Create placeholder pages (`src/src/pages/`).
    *   Ensure the basic Tauri window loads the React app.

---

## Step 3: Implement Server Profile Management

1.  **Database Module (in `src-tauri/src/database.rs`):**
    *   Implement functions for SQLite interaction using `rusqlite`.
    *   Create a function to initialize the database and create the `server_profiles` table if it doesn't exist.
    *   Implement CRUD functions for `ServerProfile`: `insert_profile`, `update_profile`, `delete_profile`, `get_all_profiles`, `get_profile_by_id`.
2.  **RCON Module (in `src-tauri/src/rcon.rs`):**
    *   Integrate the chosen RCON client crate.
    *   Create a function `test_connection(ip, port, password)` that attempts to connect and send a simple command (e.g., `version`). Handle connection errors.
    *   Create a function `send_command(ip, port, password, command)` to send arbitrary RCON commands.
3.  **Backend Commands (in `src-tauri/src/commands.rs`):**
    *   Add `#[tauri::command]` functions:
        *   `add_server_profile(profile: ServerProfile)`: Calls `database::insert_profile`.
        *   `update_server_profile(profile: ServerProfile)`: Calls `database::update_profile`.
        *   `delete_server_profile(id: String)`: Calls `database::delete_profile`.
        *   `get_server_profiles()`: Calls `database::get_all_profiles`.
        *   `test_rcon_connection(profile: ServerProfile)`: Calls `rcon::test_connection`.
4.  **Frontend Components & Pages (in `src/src/components/`, `src/src/pages/`):**
    *   Create `ServerProfileForm.tsx`: A form to input server details. Use the Tauri API layer (`tauriCommands.ts`) to call `add_server_profile` or `update_server_profile`.
    *   Create `ServerProfileList.tsx`: Displays a list of saved profiles. Use `tauriCommands.ts` to call `get_server_profiles` on load. Add buttons for Edit/Delete (calling respective commands).
    *   Create a Settings page (`src/src/pages/Settings.tsx`) to house the form and list.
    *   Implement state management (React Context or Zustand/Redux) to store the currently selected server profile.

---

## Step 4: Implement Installed Plugin Management

1.  **File System & Parsing Module (in `src-tauri/src/utils.rs` or new `plugins.rs`):**
    *   Create a function `scan_plugin_directory(server_dir, enabled)`:
        *   Takes the server directory and a boolean indicating if scanning `oxide/plugins` (enabled) or `oxide/plugins/disabled`.
        *   Uses `tokio::fs` to read directory contents asynchronously.
        *   Filters for `.cs` files.
        *   For each `.cs` file, read its content (`tokio::fs::read_to_string`).
        *   Implement logic (regex or string search) to extract plugin metadata (name, author, version) from comments (e.g., `// Plugin Name: MyPlugin`, `// Version: 1.0.0`, `// Author: Me`).
        *   Return a list of `InstalledPlugin` structs.
    *   Create functions `move_plugin_file(old_path, new_path)` using `tokio::fs::rename`.
2.  **Backend Commands (in `src-tauri/src/commands.rs`):**
    *   Add `#[tauri::command]` functions:
        *   `get_installed_plugins(server_dir: String)`: Calls `scan_plugin_directory` for both enabled and disabled folders, combines results.
        *   `enable_plugin(server_dir: String, plugin_name: String)`: Calculates old/new paths, calls `move_plugin_file`, then calls `rcon::send_command` with `oxide.load <plugin_name>`.
        *   `disable_plugin(server_dir: String, plugin_name: String)`: Calculates old/new paths, calls `move_plugin_file`, then calls `rcon::send_command` with `oxide.unload <plugin_name>`.
        *   `reload_plugin(plugin_name: String)`: Calls `rcon::send_command` with `oxide.reload <plugin_name>`.
3.  **Frontend Components & Pages (in `src/src/components/`, `src/src/pages/`):**
    *   Create `InstalledPluginsList.tsx`: Displays a table or list of installed plugins. Use `tauriCommands.ts` to call `get_installed_plugins` (passing the selected server's directory) on load.
    *   Create `InstalledPluginRow.tsx`: Displays details for a single plugin. Include UI elements (buttons/toggles) for Enable/Disable (calling `enable_plugin`/`disable_plugin`) and Reload (calling `reload_plugin`).
    *   Create an Installed Plugins page (`src/src/pages/InstalledPlugins.tsx`) to display the list.

---

## Step 5: Implement Plugin Configuration Editor

1.  **File System & Parsing Module (in `src-tauri/src/utils.rs` or new `config.rs`):**
    *   Create a function `get_config_path(server_dir, plugin_name, config_type)`: Determines the expected path (`oxide/config/<plugin_name>.json` or `.ini`).
    *   Create a function `read_config_file(path)`: Uses `tokio::fs::read_to_string`.
    *   Create a function `write_config_file(path, content)`: Uses `tokio::fs::write`.
    *   (Optional) Add basic JSON validation using `serde_json::from_str`.
2.  **Backend Commands (in `src-tauri/src/commands.rs`):**
    *   Add `#[tauri::command]` functions:
        *   `load_plugin_config(server_dir: String, plugin_name: String, config_type: String)`: Calls `get_config_path` and `read_config_file`. Returns the file content as a string.
        *   `save_plugin_config(server_dir: String, plugin_name: String, config_type: String, content: String)`: Calls `get_config_path` and `write_config_file`.
3.  **Frontend Components & Pages (in `src/src/components/`):**
    *   Create `ConfigFileEditor.tsx`:
        *   Use a rich text editor component (e.g., `react-ace`, `react-codemirror`).
        *   Add a "Load Config" button/action that calls `load_plugin_config` (passing selected server dir, plugin name, and config type - inferred from file extension or user choice).
        *   Display the loaded content in the editor.
        *   Add a "Save" button that calls `save_plugin_config` with the editor content.
    *   Integrate this editor into the `InstalledPluginRow` or a dedicated modal/page triggered by a "Configure" button.

---

## Step 6: Implement Plugin Discovery & Installation

1.  **Web Scraping & Caching Module (in `src-tauri/src/utils.rs` or new `umod_scraper.rs`):**
    *   Implement functions using `reqwest` to fetch HTML from the uMod plugin store URL.
    *   Use `scraper` to parse the HTML and extract `PluginMetaData` (name, author, version, description, download link, etc.) from the relevant HTML elements. Handle pagination and search queries.
    *   (Optional) Implement SQLite caching for scraped data in `database.rs` to avoid excessive scraping. Add functions to check cache validity (timestamp) and retrieve/store data.
2.  **Backend Commands (in `src-tauri/src/commands.rs`):**
    *   Add `#[tauri::command]` functions:
        *   `fetch_umod_plugins(page: u32, search_query: Option<String>)`: Calls the scraping logic. If caching is implemented, check cache first. Returns a list of `PluginMetaData`.
        *   `download_plugin(url: String)`: Uses `reqwest` to download the plugin file content (as bytes).
        *   `install_plugin(server_dir: String, plugin_name: Vec<String>, file_content: Vec<u8>)`:
            *   Determines the target path: `[server_dir]/oxide/plugins/<plugin_name>.cs`.
            *   Ensures the `oxide/plugins` directory exists (`tokio::fs::create_dir_all`).
            *   Saves the `file_content` to the target path (`tokio::fs::write`).
            *   Calls `rcon::send_command` with `oxide.load <plugin_name>`.
3.  **Frontend Components & Pages (in `src/src/components/`, `src/src/pages/`):**
    *   Create `PluginStoreBrowser.tsx`:
        *   Includes a search bar and pagination controls.
        *   Calls `fetch_umod_plugins` on load and when search/pagination changes.
        *   Displays the list of `PluginMetaData`.
    *   Create `PluginCard.tsx`: Displays details for a single plugin from the store.
        *   Add an "Install" button.
        *   When clicked, call `download_plugin` with the download URL from `PluginMetaData`.
        *   Once downloaded, call `install_plugin` with the selected server directory, plugin name (derived from URL or metadata), and the downloaded file content. Provide user feedback (e.g., "Downloading...", "Installing...", "Success/Failed").
    *   Create a Plugin Store page (`src/src/pages/PluginStore.tsx`) to house the browser.

---

## Step 7: Implement Update Notifications

1.  **Version Comparison Logic (in `src-tauri/src/utils.rs` or `plugins.rs`):**
    *   Use the `semver` crate to compare version strings extracted from installed plugins and scraped from the uMod store.
    *   Create a function `is_update_available(installed_version, latest_version)` that returns true if `latest_version` is greater than `installed_version` according to semantic versioning rules.
2.  **Backend Commands (in `src-tauri/src/commands.rs`):**
    *   Add `#[tauri::command]` function:
        *   `check_for_plugin_updates(server_dir: String)`:
            *   Calls `get_installed_plugins` to get installed versions.
            *   Calls `fetch_umod_plugins` (or reads from cache) to get latest versions.
            *   Compares versions using `is_update_available`.
            *   Returns a list of installed plugins for which an update is available.
3.  **Frontend Components (in `src/src/components/`):**
    *   Modify `InstalledPluginsList.tsx` or `InstalledPluginRow.tsx`:
        *   Call `check_for_plugin_updates` periodically or on user action.
        *   Display a visual indicator (e.g., badge, icon) next to plugins that have updates available.
        *   Add an "Update" button that triggers the download and install process for that specific plugin (similar to the one-click install logic).

---

## Step 8: Implement Dependency Checker (Simplified)

1.  **Dependency Check Logic (in `src-tauri/src/utils.rs` or new `dependencies.rs`):**
    *   Maintain a hardcoded list of common required DLLs (e.g., `Newtonsoft.Json.dll`, `Rust.Extension.dll`).
    *   Create a function `check_common_dependencies(server_dir)`:
        *   Construct the path to the server's managed directory: `[server_dir]/RustDedicated_Data/Managed/`.
        *   Use `tokio::fs` to read the directory contents.
        *   Check if each DLL in the hardcoded list exists in the directory.
        *   Return a list of missing DLL names.
2.  **Backend Commands (in `src-tauri/src/commands.rs`):**
    *   Add `#[tauri::command]` function:
        *   `check_common_dependencies(server_dir: String)`: Calls the dependency check logic. Returns the list of missing DLLs.
3.  **Frontend Components & Pages (in `src/src/components/`, `src/src/pages/`):**
    *   Create a `DependencyChecker.tsx` component.
    *   Call `check_common_dependencies` (passing selected server dir) on load.
    *   Display the list of missing dependencies to the user.
    *   Integrate this into a Dashboard or Settings page.

---

## Step 9: Polish & Error Handling

1.  **Robust Error Handling (Backend & Frontend):**
    *   In Rust, use `Result` extensively. Define a custom error enum for different types of errors (DB, RCON, File I/O, HTTP, Parsing). Use `thiserror` or `anyhow`.
    *   Return `Result<T, String>` or a custom error type from Tauri commands. Tauri will serialize the error string/object to the frontend.
    *   In React, handle errors returned by `invoke` calls using `.catch()` or `try...catch`.
    *   Display user-friendly error messages in the UI (e.g., using toast notifications).
    *   Implement logging in the Rust backend (e.g., using `log` crate and a suitable logger like `env_logger`).
2.  **UI/UX Improvements:**
    *   Add loading spinners or progress indicators for asynchronous operations (installing, fetching plugins).
    *   Implement clear feedback messages (success/failure toasts).
    *   Refine styling and layout.
3.  **Security:**
    *   Consider how RCON passwords will be stored. Avoid plain text. Options: OS credential manager (requires specific Tauri/Rust integration), simple encryption (requires key management), environment variables (less user-friendly for desktop). Start with a basic approach and iterate.
4.  **Build & Distribution:**
    *   Use `cargo tauri build` to create installers for target platforms.

---

This guide provides a structured approach to building the application based on the initial plan, detailing the steps and file locations for implementing each core feature.
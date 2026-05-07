use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A saved Rust server (the user's RCON target plus its on-disk install path).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProfile {
    pub id: String,
    pub name: String,
    pub ip_address: String,
    pub rcon_port: u16,
    pub rcon_password: String,
    /// Absolute path to the server install (the dir that contains
    /// `RustDedicated.exe` / `RustDedicated_Data/`, etc.).
    pub server_directory: String,
    #[serde(default)]
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input shape used when creating a new profile (id + timestamps assigned by backend).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProfileInput {
    pub name: String,
    pub ip_address: String,
    pub rcon_port: u16,
    pub rcon_password: String,
    pub server_directory: String,
    #[serde(default)]
    pub notes: Option<String>,
}

/// A plugin entry as advertised in the uMod store (catalog item, not yet installed).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMetaData {
    pub slug: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub download_url: Option<String>,
    pub page_url: Option<String>,
    pub last_updated: Option<DateTime<Utc>>,
}

/// A `.cs` file already on disk under `oxide/plugins/` or `oxide/plugins/disabled/`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub file_path: String,
    pub enabled: bool,
    pub has_config: bool,
    /// Permission strings the plugin registers via
    /// `permission.RegisterPermission("...", this)`. Useful for setting
    /// up groups without grepping the source.
    #[serde(default)]
    pub permissions: Vec<String>,
    /// Chat commands the plugin registers via `cmd.AddChatCommand(...)`.
    #[serde(default)]
    pub chat_commands: Vec<String>,
}

/// One plugin where the installed version is older than the latest in the store.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginUpdateInfo {
    pub plugin_name: String,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
}

/// Result of running [`check_common_dependencies`] against a server install.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub managed_dir: String,
    pub present: Vec<String>,
    pub missing: Vec<String>,
}

/// Lightweight view returned by the RCON test command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RconTestResult {
    pub ok: bool,
    pub server_response: Option<String>,
    pub elapsed_ms: u64,
}

/// One page of plugin store results.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStorePage {
    pub items: Vec<PluginMetaData>,
    pub page: u32,
    pub has_next: bool,
}

/// `json` or `ini` config file kind.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigKind {
    Json,
    Ini,
}

impl ConfigKind {
    pub fn extension(self) -> &'static str {
        match self {
            ConfigKind::Json => "json",
            ConfigKind::Ini => "ini",
        }
    }
}

/// One snapshot taken before a config save.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBackup {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified: Option<DateTime<Utc>>,
}

/// One row in `playerlist` parsed from RCON output.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerInfo {
    pub steam_id: String,
    pub name: String,
    pub ping: Option<u32>,
    pub connected_seconds: Option<u64>,
    pub address: Option<String>,
}

/// Distilled `serverinfo` reply.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub hostname: Option<String>,
    pub map: Option<String>,
    pub players: Option<u32>,
    pub max_players: Option<u32>,
    pub queued: Option<u32>,
    pub joining: Option<u32>,
    pub uptime_seconds: Option<u64>,
    pub framerate: Option<f32>,
    pub raw: String,
}

/// Free-form RCON command result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RconCommandResult {
    pub command: String,
    pub response: String,
    pub elapsed_ms: u64,
}

/// Result of a bulk update-all run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkUpdateResult {
    pub updated: Vec<String>,
    pub failed: Vec<BulkUpdateFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkUpdateFailure {
    pub plugin_name: String,
    pub error: String,
}

/// One starred RCON command for a given server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCommand {
    pub id: i64,
    pub profile_id: String,
    pub label: String,
    pub command: String,
    pub created_at: DateTime<Utc>,
}

/// Wire shape for `export_profiles_to_path` / `import_profiles_from_path`.
/// The version field gives us room to evolve the format without breaking
/// older exports.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileExport {
    pub version: u32,
    pub exported_at: DateTime<Utc>,
    pub profiles: Vec<ServerProfile>,
}

impl ProfileExport {
    pub const CURRENT_VERSION: u32 = 1;
}

/// One row from the server's `banlistex` reply.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BanInfo {
    pub steam_id: String,
    pub name: String,
    pub reason: Option<String>,
    /// `None` for permanent bans; otherwise the unix timestamp the ban
    /// expires at.
    pub expires_at: Option<DateTime<Utc>>,
}

/// User-configured wipe cadence for one server. `next_wipe_at` is computed
/// at fetch time from `last_wipe_at + cadence_days` so the frontend doesn't
/// need to repeat the math.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WipeSchedule {
    pub profile_id: String,
    /// Days between wipes. 7 = weekly, 14 = biweekly, 28 = monthly-ish.
    pub cadence_days: u32,
    pub last_wipe_at: Option<DateTime<Utc>>,
    pub next_wipe_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
}

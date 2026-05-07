//! Application errors, with stable user-facing codes.
//!
//! Every command failure is reported to the frontend as
//!
//! ```json
//! { "code": "RCON-001", "category": "rcon", "message": "connect timed out" }
//! ```
//!
//! The point of the codes:
//!
//! - A user can copy `RCON-001` out of a toast and we can immediately tell
//!   what went wrong without asking for a stack trace.
//! - The codes are stable across releases. Adding a new failure mode
//!   means appending a new code, never reusing one — see ERROR_CODES.md
//!   in the repo root.

use std::io;

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    // ----- Database (DB-xxx) -----
    /// SQLite error — rusqlite originated.
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    /// The connection mutex was poisoned by a panic in another thread.
    #[error("internal: database mutex poisoned")]
    DatabasePoisoned,

    // ----- Filesystem (FS-xxx) -----
    /// Wraps `std::io::Error`. The exact code is derived from `kind()`.
    #[error("io error: {0}")]
    Io(#[from] io::Error),

    // ----- Networking / HTTP (STORE-xxx) -----
    /// reqwest failed before we even saw a response.
    #[error("network error: {0}")]
    HttpRequest(reqwest::Error),

    /// uMod replied 200 but the body wasn't valid JSON, or the JSON shape
    /// didn't match what we expected.
    #[error("uMod returned an unexpected response: {0}")]
    StoreNonJson(String),

    /// We have plugin metadata in the cache but no download URL — usually
    /// means uMod hasn't published a release yet.
    #[error("plugin has no download URL")]
    StoreNoDownloadUrl,

    // ----- Serialization (SERIAL-xxx) -----
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("semver error: {0}")]
    Semver(#[from] semver::Error),

    #[error("url error: {0}")]
    Url(#[from] url::ParseError),

    // ----- RCON (RCON-xxx) -----
    /// Couldn't open the websocket within the connect timeout.
    #[error("RCON connect timed out")]
    RconConnectTimeout,

    /// Connected, sent the command, but no matching reply within the deadline.
    #[error("RCON response timed out")]
    RconResponseTimeout,

    /// The websocket closed before our matching reply arrived.
    #[error("RCON connection closed before responding")]
    RconClosed,

    /// Tungstenite-level error — TLS, frame parsing, etc.
    #[error("RCON websocket error: {0}")]
    Websocket(#[from] tokio_tungstenite::tungstenite::Error),

    // ----- Plugins (PLUGIN-xxx) -----
    #[error("invalid plugin name: {0:?}")]
    InvalidPluginName(String),

    #[error("plugin not found: {0}")]
    PluginNotFound(String),

    #[error("could not parse plugin file: {0}")]
    PluginParse(String),

    // ----- Configs (CONFIG-xxx) -----
    #[error("invalid JSON: {0}")]
    InvalidJson(String),

    #[error("invalid INI: {0}")]
    InvalidIni(String),

    #[error("config not found: {0}")]
    ConfigNotFound(String),

    // ----- Backups (BACKUP-xxx) -----
    #[error("backup not found: {0}")]
    BackupNotFound(String),

    /// User passed a backup file_name that resolves outside the backups
    /// directory — refuse the read so a malformed name can't be used to
    /// pull arbitrary files off disk.
    #[error("backup path escapes backups directory")]
    BackupPathEscape,

    // ----- Profiles & saved commands (PROFILE-xxx) -----
    #[error("profile not found: {0}")]
    ProfileNotFound(String),

    #[error("saved command not found: {0}")]
    SavedCommandNotFound(i64),

    // ----- Profile import / export (IMPORT-xxx) -----
    #[error("import file is not a valid RustApp export: {0}")]
    ImportParse(String),

    #[error(
        "export was written by a newer version of RustApp ({0}); upgrade and try again"
    )]
    ImportVersionTooNew(u32),

    // ----- Generic input (INPUT-xxx) -----
    #[error("invalid input: {0}")]
    InvalidInput(String),

    // ----- Catch-all (INTERNAL-xxx) -----
    /// Reserved for unanticipated failures. Prefer adding a more specific
    /// variant — every new failure mode should get its own code.
    #[allow(dead_code)]
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    /// Stable user-facing code. **Do not change existing return values.**
    /// Add new codes by introducing a new variant.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Database(_)            => "DB-001",
            AppError::DatabasePoisoned       => "DB-002",

            AppError::Io(e)                  => io_code(e.kind()),

            AppError::HttpRequest(_)         => "STORE-001",
            AppError::StoreNonJson(_)        => "STORE-002",
            AppError::StoreNoDownloadUrl     => "STORE-003",

            AppError::Json(_)                => "SERIAL-001",
            AppError::Semver(_)              => "SERIAL-002",
            AppError::Url(_)                 => "SERIAL-003",

            AppError::RconConnectTimeout     => "RCON-001",
            AppError::RconResponseTimeout    => "RCON-002",
            AppError::RconClosed             => "RCON-003",
            AppError::Websocket(_)           => "RCON-004",

            AppError::InvalidPluginName(_)   => "PLUGIN-001",
            AppError::PluginNotFound(_)      => "PLUGIN-002",
            AppError::PluginParse(_)         => "PLUGIN-003",

            AppError::InvalidJson(_)         => "CONFIG-001",
            AppError::InvalidIni(_)          => "CONFIG-002",
            AppError::ConfigNotFound(_)      => "CONFIG-003",

            AppError::BackupNotFound(_)      => "BACKUP-001",
            AppError::BackupPathEscape       => "BACKUP-002",

            AppError::ProfileNotFound(_)     => "PROFILE-001",
            AppError::SavedCommandNotFound(_) => "PROFILE-002",

            AppError::ImportParse(_)         => "IMPORT-001",
            AppError::ImportVersionTooNew(_) => "IMPORT-002",

            AppError::InvalidInput(_)        => "INPUT-001",

            AppError::Internal(_)            => "INTERNAL-001",
        }
    }

    /// The high-level group the code belongs to. Used by the frontend to
    /// pick an icon / colour without parsing the code string.
    pub fn category(&self) -> &'static str {
        match self.code().split_once('-').map(|x| x.0) {
            Some(c) => c,
            None => "INTERNAL",
        }
    }

    // -------- Constructors -------------------------------------------------

    pub fn invalid_input(msg: impl Into<String>) -> Self { Self::InvalidInput(msg.into()) }
    pub fn invalid_plugin_name(msg: impl Into<String>) -> Self { Self::InvalidPluginName(msg.into()) }
    pub fn plugin_not_found(msg: impl Into<String>) -> Self { Self::PluginNotFound(msg.into()) }
    pub fn plugin_parse(msg: impl Into<String>) -> Self { Self::PluginParse(msg.into()) }
    pub fn profile_not_found(msg: impl Into<String>) -> Self { Self::ProfileNotFound(msg.into()) }
    pub fn config_not_found(msg: impl Into<String>) -> Self { Self::ConfigNotFound(msg.into()) }
    pub fn backup_not_found(msg: impl Into<String>) -> Self { Self::BackupNotFound(msg.into()) }
    pub fn invalid_json(msg: impl Into<String>) -> Self { Self::InvalidJson(msg.into()) }
    pub fn invalid_ini(msg: impl Into<String>) -> Self { Self::InvalidIni(msg.into()) }
    pub fn store_non_json(msg: impl Into<String>) -> Self { Self::StoreNonJson(msg.into()) }
    pub fn import_parse(msg: impl Into<String>) -> Self { Self::ImportParse(msg.into()) }
    #[allow(dead_code)]
    pub fn internal(msg: impl Into<String>) -> Self { Self::Internal(msg.into()) }
}

/// reqwest's `Error` is a wrapper around several distinct failure modes.
/// Today we map all of them to STORE-001 — the message text already says
/// what happened (timeout vs connect refused vs status code). If we want
/// to split them further later, this is the place.
impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::HttpRequest(e)
    }
}

fn io_code(kind: io::ErrorKind) -> &'static str {
    match kind {
        io::ErrorKind::NotFound          => "FS-001",
        io::ErrorKind::PermissionDenied  => "FS-002",
        io::ErrorKind::AlreadyExists     => "FS-003",
        io::ErrorKind::TimedOut          => "FS-004",
        _                                => "FS-099",
    }
}

/// Wire format: `{ code, category, message }`. The frontend renders the
/// message as the user-visible text and shows the code in monospace at
/// the end of the toast.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("AppError", 3)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("category", &self.category())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_stable_per_variant() {
        assert_eq!(AppError::RconConnectTimeout.code(), "RCON-001");
        assert_eq!(AppError::RconResponseTimeout.code(), "RCON-002");
        assert_eq!(AppError::BackupPathEscape.code(), "BACKUP-002");
        assert_eq!(
            AppError::ImportVersionTooNew(99).code(),
            "IMPORT-002",
        );
    }

    #[test]
    fn io_kind_maps_to_specific_code() {
        let e: AppError =
            io::Error::new(io::ErrorKind::NotFound, "x").into();
        assert_eq!(e.code(), "FS-001");
        let e: AppError =
            io::Error::new(io::ErrorKind::PermissionDenied, "x").into();
        assert_eq!(e.code(), "FS-002");
    }

    #[test]
    fn category_is_first_segment() {
        assert_eq!(AppError::DatabasePoisoned.category(), "DB");
        assert_eq!(AppError::BackupPathEscape.category(), "BACKUP");
        assert_eq!(AppError::Internal("oops".into()).category(), "INTERNAL");
    }

    #[test]
    fn serializes_as_struct() {
        let e = AppError::PluginNotFound("Vanish".into());
        let v: serde_json::Value =
            serde_json::to_value(&e).unwrap();
        assert_eq!(v["code"], "PLUGIN-002");
        assert_eq!(v["category"], "PLUGIN");
        assert!(v["message"].as_str().unwrap().contains("Vanish"));
    }
}

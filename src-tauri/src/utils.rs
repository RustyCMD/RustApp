use std::path::{Path, PathBuf};

use crate::error::{AppError, Result};
use crate::models::ConfigKind;

/// `<server_dir>/oxide/plugins`
pub fn enabled_plugins_dir(server_dir: &str) -> PathBuf {
    Path::new(server_dir).join("oxide").join("plugins")
}

/// `<server_dir>/oxide/plugins/disabled`
pub fn disabled_plugins_dir(server_dir: &str) -> PathBuf {
    enabled_plugins_dir(server_dir).join("disabled")
}

/// `<server_dir>/oxide/config`
pub fn config_dir(server_dir: &str) -> PathBuf {
    Path::new(server_dir).join("oxide").join("config")
}

/// `<server_dir>/RustDedicated_Data/Managed`
pub fn managed_dir(server_dir: &str) -> PathBuf {
    Path::new(server_dir)
        .join("RustDedicated_Data")
        .join("Managed")
}

/// `<server_dir>/oxide/config/<plugin>.{json|ini}`
pub fn config_path(server_dir: &str, plugin_name: &str, kind: ConfigKind) -> PathBuf {
    config_dir(server_dir).join(format!("{plugin_name}.{}", kind.extension()))
}

/// Compare two version strings using semver. `latest > installed` ⇒ true.
/// Falls back to a string compare if semver parsing fails on either side.
pub fn is_update_available(installed: &str, latest: &str) -> bool {
    match (
        semver::Version::parse(installed),
        semver::Version::parse(latest),
    ) {
        (Ok(a), Ok(b)) => b > a,
        _ => latest != installed && latest > installed,
    }
}

/// Reject paths containing `..` or path separators — used when a plugin name is
/// going to be joined into an on-disk path. Keeps a malicious server response
/// from escaping the configured server directory.
pub fn validate_plugin_name(name: &str) -> Result<()> {
    if name.is_empty()
        || name.contains("..")
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
    {
        return Err(AppError::invalid_plugin_name(name.to_string()));
    }
    Ok(())
}

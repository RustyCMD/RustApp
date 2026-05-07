//! Read/write plugin configs at `oxide/config/<plugin>.{json|ini}`.

use std::path::PathBuf;

use tokio::fs;

use crate::error::{AppError, Result};
use crate::models::ConfigKind;
use crate::utils::{config_path, validate_plugin_name};

pub async fn load(
    server_dir: &str,
    plugin_name: &str,
    kind: ConfigKind,
) -> Result<(PathBuf, String)> {
    validate_plugin_name(plugin_name)?;
    let path = config_path(server_dir, plugin_name, kind);
    if !path.exists() {
        return Err(AppError::not_found(format!(
            "config not found at {}",
            path.display()
        )));
    }
    let content = fs::read_to_string(&path).await?;
    Ok((path, content))
}

pub async fn save(
    server_dir: &str,
    plugin_name: &str,
    kind: ConfigKind,
    content: &str,
) -> Result<PathBuf> {
    validate_plugin_name(plugin_name)?;
    validate_content(kind, content)?;
    let path = config_path(server_dir, plugin_name, kind);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(&path, content).await?;
    Ok(path)
}

/// Refuse to overwrite a config with something that obviously isn't valid for
/// the format the user picked. Saves an unrecoverable "I edited the wrong
/// quote and now my server won't start" footgun.
fn validate_content(kind: ConfigKind, content: &str) -> Result<()> {
    match kind {
        ConfigKind::Json => {
            serde_json::from_str::<serde_json::Value>(content)
                .map_err(|e| AppError::invalid_input(format!("invalid JSON: {e}")))?;
        }
        ConfigKind::Ini => {
            ini::Ini::load_from_str(content)
                .map_err(|e| AppError::invalid_input(format!("invalid INI: {e}")))?;
        }
    }
    Ok(())
}

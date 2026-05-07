//! Read/write plugin configs at `oxide/config/<plugin>.{json|ini}`.

use std::path::{Path, PathBuf};

use chrono::Utc;
use tokio::fs;

use crate::error::{AppError, Result};
use crate::models::ConfigKind;
use crate::utils::{config_dir, config_path, validate_plugin_name};

pub async fn load(
    server_dir: &str,
    plugin_name: &str,
    kind: ConfigKind,
) -> Result<(PathBuf, String)> {
    validate_plugin_name(plugin_name)?;
    let path = config_path(server_dir, plugin_name, kind);
    if !path.exists() {
        return Err(AppError::config_not_found(path.display().to_string()));
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
    // Snapshot the previous version so a bad edit can be recovered. We cap
    // backups loosely below — see `prune_backups`.
    if path.exists() {
        let _ = backup(&path, plugin_name, kind, server_dir).await;
    }
    fs::write(&path, content).await?;
    Ok(path)
}

async fn backup(
    src: &Path,
    plugin_name: &str,
    kind: ConfigKind,
    server_dir: &str,
) -> Result<PathBuf> {
    let backups = config_dir(server_dir).join(".rustapp-backups");
    fs::create_dir_all(&backups).await?;
    let stamp = Utc::now().format("%Y%m%dT%H%M%S");
    let dest = backups.join(format!("{plugin_name}-{stamp}.{}", kind.extension()));
    fs::copy(src, &dest).await?;
    let _ = prune_backups(&backups, plugin_name, kind, 10).await;
    Ok(dest)
}

/// Keep only the most recent `keep` backups for a given plugin+kind.
async fn prune_backups(
    dir: &Path,
    plugin_name: &str,
    kind: ConfigKind,
    keep: usize,
) -> Result<()> {
    let mut rd = fs::read_dir(dir).await?;
    let prefix = format!("{plugin_name}-");
    let suffix = format!(".{}", kind.extension());
    let mut entries: Vec<_> = Vec::new();
    while let Some(e) = rd.next_entry().await? {
        let name = e.file_name();
        let Some(s) = name.to_str() else { continue };
        if s.starts_with(&prefix) && s.ends_with(&suffix) {
            entries.push((s.to_string(), e.path()));
        }
    }
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in entries.into_iter().skip(keep) {
        let _ = fs::remove_file(path).await;
    }
    Ok(())
}

/// Read a previous snapshot back into memory so the frontend can preview
/// it before deciding to restore. We resolve `file_name` against the
/// backups dir explicitly so the caller can't read arbitrary files by
/// passing a path with `..`.
pub async fn read_backup(
    server_dir: &str,
    plugin_name: &str,
    file_name: &str,
) -> Result<String> {
    validate_plugin_name(plugin_name)?;
    let backups = config_dir(server_dir).join(".rustapp-backups");
    let candidate = backups.join(file_name);
    let canon_dir = fs::canonicalize(&backups).await?;
    let canon_file = fs::canonicalize(&candidate)
        .await
        .map_err(|_| AppError::backup_not_found(file_name))?;
    if !canon_file.starts_with(&canon_dir) {
        return Err(AppError::BackupPathEscape);
    }
    let content = fs::read_to_string(&canon_file).await?;
    Ok(content)
}

/// Replace the live config with the contents of an existing backup, after
/// taking a fresh backup of the current state (so a restore is itself
/// undo-able). Returns the restored path.
pub async fn restore_backup(
    server_dir: &str,
    plugin_name: &str,
    file_name: &str,
) -> Result<PathBuf> {
    let content = read_backup(server_dir, plugin_name, file_name).await?;
    let kind = if file_name.ends_with(".ini") {
        ConfigKind::Ini
    } else {
        ConfigKind::Json
    };
    save(server_dir, plugin_name, kind, &content).await
}

pub async fn list_backups(
    server_dir: &str,
    plugin_name: &str,
) -> Result<Vec<crate::models::ConfigBackup>> {
    validate_plugin_name(plugin_name)?;
    let dir = config_dir(server_dir).join(".rustapp-backups");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let prefix = format!("{plugin_name}-");
    let mut rd = fs::read_dir(&dir).await?;
    let mut out = Vec::new();
    while let Some(e) = rd.next_entry().await? {
        let name = e.file_name();
        let Some(s) = name.to_str() else { continue };
        if !s.starts_with(&prefix) {
            continue;
        }
        let meta = e.metadata().await?;
        out.push(crate::models::ConfigBackup {
            file_name: s.to_string(),
            path: e.path().to_string_lossy().into_owned(),
            size_bytes: meta.len(),
            modified: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| chrono::DateTime::<Utc>::from_timestamp(d.as_secs() as i64, 0))
                .flatten(),
        });
    }
    out.sort_by(|a, b| b.file_name.cmp(&a.file_name));
    Ok(out)
}

/// Refuse to overwrite a config with something that obviously isn't valid for
/// the format the user picked. Saves an unrecoverable "I edited the wrong
/// quote and now my server won't start" footgun.
fn validate_content(kind: ConfigKind, content: &str) -> Result<()> {
    match kind {
        ConfigKind::Json => {
            serde_json::from_str::<serde_json::Value>(content)
                .map_err(|e| AppError::invalid_json(e.to_string()))?;
        }
        ConfigKind::Ini => {
            ini::Ini::load_from_str(content)
                .map_err(|e| AppError::invalid_ini(e.to_string()))?;
        }
    }
    Ok(())
}

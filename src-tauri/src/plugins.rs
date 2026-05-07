//! Scanning, parsing, and enable/disable for installed `.cs` plugins.
//!
//! uMod plugins are C# source files. The metadata we care about lives near
//! the top of the file:
//!
//! ```text
//! [Info("PluginName", "Author", "1.2.3")]
//! [Description("A short description")]
//! ```
//!
//! Disabled plugins live in `oxide/plugins/disabled/` — moving the file
//! between the two directories is what enables/disables it on disk; the live
//! reload happens via RCON (`oxide.load` / `oxide.unload`).

use std::path::{Path, PathBuf};

use once_cell::sync::Lazy;
use regex::Regex;
use tokio::fs;

use crate::error::{AppError, Result};
use crate::models::InstalledPlugin;
use crate::utils::{
    config_path, disabled_plugins_dir, enabled_plugins_dir, validate_plugin_name,
};

static INFO_RE: Lazy<Regex> = Lazy::new(|| {
    // [Info("Name", "Author", "1.2.3"[, optional 4th arg])]
    Regex::new(
        r#"(?m)\[\s*Info\s*\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*"([^"]+)"(?:\s*,\s*[^)]*)?\s*\)\s*\]"#,
    )
    .expect("INFO_RE")
});
static DESC_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?m)\[\s*Description\s*\(\s*"([^"]*)"\s*\)\s*\]"#).expect("DESC_RE")
});
// `permission.RegisterPermission("foo.bar", this)` — usually appears once
// per perm in `OnServerInitialized` / `Init` / `Loaded`.
static PERM_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"permission\.RegisterPermission\s*\(\s*"([^"]+)""#).expect("PERM_RE")
});
// `cmd.AddChatCommand("kit", this, …)` or `[ChatCommand("kit")]`.
static CHATCMD_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"(?:cmd\.AddChatCommand\s*\(\s*"([^"]+)"|\[\s*ChatCommand\s*\(\s*"([^"]+)")"#,
    )
    .expect("CHATCMD_RE")
});

/// Walk both `oxide/plugins` and `oxide/plugins/disabled` and return every
/// `.cs` plugin we can identify.
pub async fn get_installed_plugins(server_dir: &str) -> Result<Vec<InstalledPlugin>> {
    let mut out = Vec::new();
    scan_dir(&enabled_plugins_dir(server_dir), true, server_dir, &mut out).await?;
    scan_dir(
        &disabled_plugins_dir(server_dir),
        false,
        server_dir,
        &mut out,
    )
    .await?;
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

async fn scan_dir(
    dir: &Path,
    enabled: bool,
    server_dir: &str,
    out: &mut Vec<InstalledPlugin>,
) -> Result<()> {
    let mut rd = match fs::read_dir(dir).await {
        Ok(rd) => rd,
        // Either oxide/ isn't there yet, or there are no disabled plugins.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };

    while let Some(entry) = rd.next_entry().await? {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("cs") {
            continue;
        }
        match parse_plugin_file(&path, enabled, server_dir).await {
            Ok(p) => out.push(p),
            Err(err) => log::warn!("skipping {}: {err}", path.display()),
        }
    }
    Ok(())
}

async fn parse_plugin_file(
    path: &Path,
    enabled: bool,
    server_dir: &str,
) -> Result<InstalledPlugin> {
    let text = fs::read_to_string(path).await?;
    // Header metadata sits in the first ~8KB; permissions / commands can
    // appear anywhere in the file (often inside Init), so we scan the
    // whole source for those.
    let head = text.chars().take(8 * 1024).collect::<String>();

    let (name, author, version) = if let Some(c) = INFO_RE.captures(&head) {
        (
            c.get(1).map(|m| m.as_str().to_string()),
            c.get(2).map(|m| m.as_str().to_string()),
            c.get(3).map(|m| m.as_str().to_string()),
        )
    } else {
        (None, None, None)
    };

    let description = DESC_RE
        .captures(&head)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()));

    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());
    let resolved_name = name.or(stem).ok_or_else(|| {
        AppError::plugin_parse(format!("could not derive name for {}", path.display()))
    })?;

    let has_config = config_path(server_dir, &resolved_name, crate::models::ConfigKind::Json)
        .exists()
        || config_path(server_dir, &resolved_name, crate::models::ConfigKind::Ini).exists();

    let mut permissions: Vec<String> = PERM_RE
        .captures_iter(&text)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect();
    permissions.sort();
    permissions.dedup();

    let mut chat_commands: Vec<String> = CHATCMD_RE
        .captures_iter(&text)
        .filter_map(|c| {
            c.get(1)
                .or_else(|| c.get(2))
                .map(|m| m.as_str().to_string())
        })
        .collect();
    chat_commands.sort();
    chat_commands.dedup();

    Ok(InstalledPlugin {
        name: resolved_name,
        author,
        version,
        description,
        file_path: path.to_string_lossy().into_owned(),
        enabled,
        has_config,
        permissions,
        chat_commands,
    })
}

/// Move `oxide/plugins/disabled/<name>.cs` → `oxide/plugins/<name>.cs`.
/// Returns the new on-disk path.
pub async fn enable_plugin(server_dir: &str, plugin_name: &str) -> Result<PathBuf> {
    validate_plugin_name(plugin_name)?;
    let from = disabled_plugins_dir(server_dir).join(format!("{plugin_name}.cs"));
    let to = enabled_plugins_dir(server_dir).join(format!("{plugin_name}.cs"));
    if !from.exists() {
        return Err(AppError::plugin_not_found(format!(
            "{plugin_name} (in disabled directory)"
        )));
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::rename(&from, &to).await?;
    Ok(to)
}

/// Move `oxide/plugins/<name>.cs` → `oxide/plugins/disabled/<name>.cs`.
pub async fn disable_plugin(server_dir: &str, plugin_name: &str) -> Result<PathBuf> {
    validate_plugin_name(plugin_name)?;
    let from = enabled_plugins_dir(server_dir).join(format!("{plugin_name}.cs"));
    let to = disabled_plugins_dir(server_dir).join(format!("{plugin_name}.cs"));
    if !from.exists() {
        return Err(AppError::plugin_not_found(format!(
            "{plugin_name} (in enabled directory)"
        )));
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::rename(&from, &to).await?;
    Ok(to)
}

/// Write the plugin source into `oxide/plugins/<name>.cs`, replacing any
/// existing file. Caller is expected to follow up with an `oxide.load` RCON
/// call.
pub async fn install_plugin_file(
    server_dir: &str,
    plugin_name: &str,
    file_content: &[u8],
) -> Result<PathBuf> {
    validate_plugin_name(plugin_name)?;
    let dir = enabled_plugins_dir(server_dir);
    fs::create_dir_all(&dir).await?;
    let target = dir.join(format!("{plugin_name}.cs"));
    fs::write(&target, file_content).await?;
    Ok(target)
}

/// Read a `.cs` file from anywhere on disk and install it into the
/// server's `oxide/plugins/` directory. The plugin name is taken from
/// the file's `[Info(...)]` attribute, falling back to the filename
/// stem. Returns the parsed plugin metadata + the destination path.
pub async fn install_local_plugin(
    server_dir: &str,
    source_path: &Path,
) -> Result<(InstalledPlugin, PathBuf)> {
    if source_path.extension().and_then(|s| s.to_str()) != Some("cs") {
        return Err(AppError::invalid_input(
            "expected a .cs file (uMod plugins are C# source)",
        ));
    }

    let bytes = fs::read(source_path).await?;
    let text = String::from_utf8_lossy(&bytes);

    let info_name = INFO_RE
        .captures(&text)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()));
    let stem = source_path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());

    let plugin_name = info_name.or(stem).ok_or_else(|| {
        AppError::plugin_parse(format!(
            "could not derive a plugin name from {}",
            source_path.display()
        ))
    })?;

    let target = install_plugin_file(server_dir, &plugin_name, &bytes).await?;

    // Parse the freshly-installed file so the caller gets the same shape
    // it would from a fresh scan (including the new permissions list).
    let installed = parse_plugin_file(&target, true, server_dir).await?;
    Ok((installed, target))
}

/// Remove `<plugin>.cs` (from either enabled/ or disabled/). Optionally also
/// removes its config files. Returns the list of paths actually deleted.
pub async fn uninstall_plugin(
    server_dir: &str,
    plugin_name: &str,
    delete_config: bool,
) -> Result<Vec<PathBuf>> {
    validate_plugin_name(plugin_name)?;
    let mut removed = Vec::new();

    for candidate in [
        enabled_plugins_dir(server_dir).join(format!("{plugin_name}.cs")),
        disabled_plugins_dir(server_dir).join(format!("{plugin_name}.cs")),
    ] {
        if candidate.exists() {
            fs::remove_file(&candidate).await?;
            removed.push(candidate);
        }
    }

    if removed.is_empty() {
        return Err(AppError::plugin_not_found(format!(
            "{plugin_name} (neither plugins/ nor plugins/disabled)"
        )));
    }

    if delete_config {
        for kind in [crate::models::ConfigKind::Json, crate::models::ConfigKind::Ini] {
            let p = crate::utils::config_path(server_dir, plugin_name, kind);
            if p.exists() {
                fs::remove_file(&p).await?;
                removed.push(p);
            }
        }
    }

    Ok(removed)
}

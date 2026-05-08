//! Per-profile launch settings — the values that get baked into the
//! generated `start.bat`. One row per `ServerProfile` (FK ON DELETE CASCADE).
//!
//! `effective(db, profile)` returns the stored row if present, otherwise a
//! defaults-filled `LaunchSettings` based on the profile (sanitized name as
//! identity, profile name as hostname, RCON port from the profile, port
//! defaults that mirror `Z:\RustServer\start.bat`). That way the user gets
//! a sane `start.bat` even if they never opened the launch-settings form.

use once_cell::sync::Lazy;
use regex::Regex;
use rusqlite::{params, OptionalExtension};

use crate::database::Db;
use crate::error::{AppError, Result};
use crate::models::{LaunchSettings, ServerProfile};

pub fn migrate(db: &Db) -> Result<()> {
    db.with_conn(|c| {
        c.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS launch_settings (
                profile_id     TEXT PRIMARY KEY
                               REFERENCES server_profiles(id) ON DELETE CASCADE,
                identity       TEXT NOT NULL,
                hostname       TEXT NOT NULL,
                description    TEXT NOT NULL,
                url            TEXT NOT NULL,
                header_image   TEXT NOT NULL,
                server_ip      TEXT NOT NULL,
                server_port    INTEGER NOT NULL,
                query_port     INTEGER NOT NULL,
                app_port       INTEGER NOT NULL,
                max_players    INTEGER NOT NULL,
                worldsize      INTEGER NOT NULL,
                seed           INTEGER NOT NULL,
                level          TEXT NOT NULL,
                save_interval  INTEGER NOT NULL,
                tickrate       INTEGER NOT NULL,
                global_chat    INTEGER NOT NULL,
                salt           INTEGER NOT NULL,
                extra_args     TEXT NOT NULL
            );
            "#,
        )?;
        Ok(())
    })
}

pub fn get(db: &Db, profile_id: &str) -> Result<Option<LaunchSettings>> {
    db.with_conn(|c| {
        let row = c
            .query_row(
                r#"SELECT profile_id, identity, hostname, description, url, header_image,
                          server_ip, server_port, query_port, app_port,
                          max_players, worldsize, seed, level,
                          save_interval, tickrate, global_chat, salt, extra_args
                   FROM launch_settings WHERE profile_id = ?1"#,
                params![profile_id],
                row_to_settings,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn upsert(db: &Db, s: &LaunchSettings) -> Result<()> {
    if s.server_port == 0 || s.query_port == 0 || s.app_port == 0 {
        return Err(AppError::invalid_input("ports must be > 0"));
    }
    if s.identity.trim().is_empty() {
        return Err(AppError::invalid_input("identity is required"));
    }
    db.with_conn(|c| {
        c.execute(
            r#"INSERT INTO launch_settings
               (profile_id, identity, hostname, description, url, header_image,
                server_ip, server_port, query_port, app_port,
                max_players, worldsize, seed, level,
                save_interval, tickrate, global_chat, salt, extra_args)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                       ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
               ON CONFLICT(profile_id) DO UPDATE SET
                 identity      = excluded.identity,
                 hostname      = excluded.hostname,
                 description   = excluded.description,
                 url           = excluded.url,
                 header_image  = excluded.header_image,
                 server_ip     = excluded.server_ip,
                 server_port   = excluded.server_port,
                 query_port    = excluded.query_port,
                 app_port      = excluded.app_port,
                 max_players   = excluded.max_players,
                 worldsize     = excluded.worldsize,
                 seed          = excluded.seed,
                 level         = excluded.level,
                 save_interval = excluded.save_interval,
                 tickrate      = excluded.tickrate,
                 global_chat   = excluded.global_chat,
                 salt          = excluded.salt,
                 extra_args    = excluded.extra_args"#,
            params![
                s.profile_id,
                s.identity,
                s.hostname,
                s.description,
                s.url,
                s.header_image,
                s.server_ip,
                s.server_port,
                s.query_port,
                s.app_port,
                s.max_players,
                s.worldsize,
                s.seed,
                s.level,
                s.save_interval,
                s.tickrate,
                s.global_chat as i64,
                s.salt,
                s.extra_args,
            ],
        )?;
        Ok(())
    })
}

pub fn delete(db: &Db, profile_id: &str) -> Result<()> {
    db.with_conn(|c| {
        c.execute(
            "DELETE FROM launch_settings WHERE profile_id = ?1",
            params![profile_id],
        )?;
        Ok(())
    })
}

/// Stored settings if present; otherwise a defaults-filled view that mirrors
/// the example `Z:\RustServer\start.bat`. Either way, what comes out of here
/// is what the bat-generator hands to disk.
pub fn effective(db: &Db, profile: &ServerProfile) -> Result<LaunchSettings> {
    if let Some(s) = get(db, &profile.id)? {
        return Ok(s);
    }
    Ok(defaults_for(profile))
}

pub fn defaults_for(profile: &ServerProfile) -> LaunchSettings {
    LaunchSettings {
        profile_id: profile.id.clone(),
        identity: sanitize_identity(&profile.name),
        hostname: profile.name.clone(),
        description: "Welcome to my Rust server!".to_string(),
        url: String::new(),
        header_image: String::new(),
        server_ip: "0.0.0.0".to_string(),
        server_port: 28015,
        query_port: 28017,
        app_port: 28082,
        max_players: 50,
        worldsize: 4000,
        seed: 12345,
        level: "Procedural Map".to_string(),
        save_interval: 300,
        tickrate: 30,
        global_chat: true,
        salt: 1,
        extra_args: String::new(),
    }
}

/// Render the start.bat content for `profile` + `settings`. No `:start` /
/// `goto start` restart loop — the Stop button needs the bat to exit
/// cleanly when RustDedicated.exe quits.
pub fn render_start_bat(profile: &ServerProfile, s: &LaunchSettings) -> String {
    let mut out = String::new();
    out.push_str("@echo off\r\n");
    out.push_str(&format!("title {}\r\n", esc_title(&profile.name)));
    out.push_str("\r\n");
    out.push_str("echo Starting Rust Server...\r\n");
    out.push_str("\r\n");
    out.push_str("RustDedicated.exe -batchmode ^\r\n");
    push_str_arg(&mut out, "server.ip", &s.server_ip);
    push_int_arg(&mut out, "server.port", s.server_port as u64);
    push_int_arg(&mut out, "server.queryport", s.query_port as u64);
    push_str_arg(&mut out, "rcon.ip", "0.0.0.0");
    push_int_arg(&mut out, "rcon.port", profile.rcon_port as u64);
    push_str_arg(&mut out, "rcon.password", &profile.rcon_password);
    push_int_arg(&mut out, "rcon.web", 1);
    push_str_arg(&mut out, "server.identity", &s.identity);
    push_str_arg(&mut out, "server.hostname", &s.hostname);
    push_str_arg(&mut out, "server.description", &s.description);
    push_str_arg(&mut out, "server.url", &s.url);
    push_str_arg(&mut out, "server.headerimage", &s.header_image);
    push_int_arg(&mut out, "server.maxplayers", s.max_players as u64);
    push_int_arg(&mut out, "server.worldsize", s.worldsize as u64);
    push_int_arg(&mut out, "server.seed", s.seed as u64);
    push_str_arg(&mut out, "server.level", &s.level);
    push_int_arg(&mut out, "server.saveinterval", s.save_interval as u64);
    push_int_arg(&mut out, "server.tickrate", s.tickrate as u64);
    push_bool_arg(&mut out, "server.globalchat", s.global_chat);
    push_int_arg(&mut out, "server.salt", s.salt as u64);

    let extra = s.extra_args.trim();
    if extra.is_empty() {
        // Last argument: no trailing caret.
        push_int_arg_last(&mut out, "app.port", s.app_port as u64);
    } else {
        push_int_arg(&mut out, "app.port", s.app_port as u64);
        // User-provided extras go on their own line, no trailing caret.
        out.push_str(" ");
        out.push_str(extra);
        out.push_str("\r\n");
    }

    out.push_str("\r\n");
    out.push_str("echo Server has stopped.\r\n");
    out
}

/// `+rcon.password "<value>"` (preferred) or `+rcon.password <value>` from
/// a hand-written start.bat. Captures both quoted and unquoted forms; for
/// unquoted values, stops at whitespace or the trailing `^` line-continuation.
static RCON_PASSWORD_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\+rcon\.password\s+(?:"([^"]+)"|(\S+?)(?:\s|\^|$))"#)
        .expect("RCON_PASSWORD_RE")
});

/// Read `<server_directory>/start.bat` and pull out the RCON password if one
/// is configured. Returns `Ok(None)` when the file is missing or doesn't
/// contain `+rcon.password`. Used by [`crate::commands::sync_profile_from_start_bat`]
/// so a user with a hand-written start.bat doesn't have to retype the
/// password into the profile.
pub async fn extract_rcon_password(server_directory: &str) -> Result<Option<String>> {
    let bat = std::path::Path::new(server_directory).join("start.bat");
    let text = match tokio::fs::read_to_string(&bat).await {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let caps = match RCON_PASSWORD_RE.captures(&text) {
        Some(c) => c,
        None => return Ok(None),
    };
    let password = caps.get(1).or_else(|| caps.get(2)).map(|m| m.as_str().trim().to_string());
    Ok(password.filter(|s| !s.is_empty()))
}

pub async fn write_start_bat(profile: &ServerProfile, settings: &LaunchSettings) -> Result<()> {
    let dir = std::path::PathBuf::from(&profile.server_directory);
    if !dir.exists() {
        return Err(AppError::invalid_input(format!(
            "server directory does not exist: {}",
            profile.server_directory
        )));
    }
    let bat = dir.join("start.bat");
    let content = render_start_bat(profile, settings);
    tokio::fs::write(&bat, content).await?;
    Ok(())
}

fn row_to_settings(row: &rusqlite::Row<'_>) -> rusqlite::Result<LaunchSettings> {
    Ok(LaunchSettings {
        profile_id: row.get(0)?,
        identity: row.get(1)?,
        hostname: row.get(2)?,
        description: row.get(3)?,
        url: row.get(4)?,
        header_image: row.get(5)?,
        server_ip: row.get(6)?,
        server_port: row.get::<_, i64>(7)? as u16,
        query_port: row.get::<_, i64>(8)? as u16,
        app_port: row.get::<_, i64>(9)? as u16,
        max_players: row.get::<_, i64>(10)? as u32,
        worldsize: row.get::<_, i64>(11)? as u32,
        seed: row.get::<_, i64>(12)? as u32,
        level: row.get(13)?,
        save_interval: row.get::<_, i64>(14)? as u32,
        tickrate: row.get::<_, i64>(15)? as u32,
        global_chat: row.get::<_, i64>(16)? != 0,
        salt: row.get::<_, i64>(17)? as u32,
        extra_args: row.get(18)?,
    })
}

fn push_str_arg(out: &mut String, key: &str, value: &str) {
    out.push_str(&format!(" +{} \"{}\" ^\r\n", key, esc_quotes(value)));
}

fn push_int_arg(out: &mut String, key: &str, value: u64) {
    out.push_str(&format!(" +{} {} ^\r\n", key, value));
}

fn push_int_arg_last(out: &mut String, key: &str, value: u64) {
    out.push_str(&format!(" +{} {}\r\n", key, value));
}

fn push_bool_arg(out: &mut String, key: &str, value: bool) {
    out.push_str(&format!(" +{} {} ^\r\n", key, value));
}

/// Strip characters that aren't legal in `server.identity` (it becomes a
/// folder name on disk under `<server_dir>/server/<identity>/`). Falls back
/// to "myserver" if everything got stripped.
fn sanitize_identity(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "myserver".to_string()
    } else {
        trimmed
    }
}

fn esc_quotes(s: &str) -> String {
    // RustDedicated args use double-quoted strings; replace embedded quotes
    // with apostrophes so we never produce a malformed bat file.
    s.replace('"', "'")
}

fn esc_title(s: &str) -> String {
    // `title` is a cmd.exe builtin that consumes everything to end-of-line —
    // strip CR/LF.
    s.replace(['\r', '\n'], " ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn fake_profile() -> ServerProfile {
        ServerProfile {
            id: "p1".into(),
            name: "My Test Srv".into(),
            ip_address: "127.0.0.1".into(),
            rcon_port: 28016,
            rcon_password: "secret".into(),
            server_directory: "C:\\nope".into(),
            notes: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn defaults_use_profile_name_for_hostname() {
        let p = fake_profile();
        let s = defaults_for(&p);
        assert_eq!(s.hostname, "My Test Srv");
        assert_eq!(s.identity, "my_test_srv");
        assert_eq!(s.server_port, 28015);
    }

    #[test]
    fn rendered_bat_has_no_restart_loop() {
        let p = fake_profile();
        let s = defaults_for(&p);
        let bat = render_start_bat(&p, &s);
        assert!(!bat.contains(":start"));
        assert!(!bat.contains("goto start"));
        assert!(bat.contains("RustDedicated.exe"));
        assert!(bat.contains("+rcon.password \"secret\""));
        assert!(bat.contains("+server.hostname \"My Test Srv\""));
    }
}

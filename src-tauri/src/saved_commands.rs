//! Per-profile starred RCON commands so users can rerun "playerlist",
//! "save world", `kick "<id>"` etc. without retyping. Owned table because
//! lifetimes are decoupled from the activity log (we don't want the
//! starred set to grow with every command sent).

use chrono::{DateTime, Utc};
use rusqlite::params;

use crate::database::Db;
use crate::error::{AppError, Result};
use crate::models::SavedCommand;

pub fn migrate(db: &Db) -> Result<()> {
    db.with_conn(|c| {
        c.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS saved_commands (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id  TEXT    NOT NULL REFERENCES server_profiles(id) ON DELETE CASCADE,
                label       TEXT    NOT NULL,
                command     TEXT    NOT NULL,
                created_at  TEXT    NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_saved_commands_profile
                ON saved_commands(profile_id);
            "#,
        )?;
        Ok(())
    })
}

pub fn add(db: &Db, profile_id: &str, label: &str, command: &str) -> Result<SavedCommand> {
    let now = Utc::now();
    let id = db.with_conn(|c| {
        c.execute(
            r#"INSERT INTO saved_commands (profile_id, label, command, created_at)
               VALUES (?1, ?2, ?3, ?4)"#,
            params![profile_id, label, command, now.to_rfc3339()],
        )?;
        Ok(c.last_insert_rowid())
    })?;
    Ok(SavedCommand {
        id,
        profile_id: profile_id.to_string(),
        label: label.to_string(),
        command: command.to_string(),
        created_at: now,
    })
}

pub fn list(db: &Db, profile_id: &str) -> Result<Vec<SavedCommand>> {
    db.with_conn(|c| {
        let mut stmt = c.prepare(
            r#"SELECT id, profile_id, label, command, created_at
               FROM saved_commands
               WHERE profile_id = ?1
               ORDER BY label COLLATE NOCASE ASC"#,
        )?;
        let rows = stmt
            .query_map([profile_id], |row| {
                let ts: String = row.get(4)?;
                Ok(SavedCommand {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    label: row.get(2)?,
                    command: row.get(3)?,
                    created_at: DateTime::parse_from_rfc3339(&ts)
                        .map(|d| d.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(rows)
    })
}

pub fn delete(db: &Db, id: i64) -> Result<()> {
    let rows = db.with_conn(|c| {
        c.execute("DELETE FROM saved_commands WHERE id = ?1", params![id])
            .map_err(AppError::from)
    })?;
    if rows == 0 {
        return Err(AppError::SavedCommandNotFound(id));
    }
    Ok(())
}

//! Per-profile wipe cadence + last-wipe tracker. Used to drive the
//! "next wipe in N days" countdown on the Dashboard. Pure local state —
//! no RCON contact, just the user's own bookkeeping.

use chrono::{DateTime, Utc};
use rusqlite::{params, OptionalExtension};

use crate::database::Db;
use crate::error::{AppError, Result};
use crate::models::WipeSchedule;

pub fn migrate(db: &Db) -> Result<()> {
    db.with_conn(|c| {
        c.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS wipe_schedules (
                profile_id    TEXT PRIMARY KEY
                              REFERENCES server_profiles(id) ON DELETE CASCADE,
                cadence_days  INTEGER NOT NULL,
                last_wipe_at  TEXT,
                notes         TEXT
            );
            "#,
        )?;
        Ok(())
    })
}

pub fn get(db: &Db, profile_id: &str) -> Result<Option<WipeSchedule>> {
    db.with_conn(|c| {
        let row = c
            .query_row(
                r#"SELECT profile_id, cadence_days, last_wipe_at, notes
                   FROM wipe_schedules WHERE profile_id = ?1"#,
                params![profile_id],
                |row| {
                    let last: Option<String> = row.get(2)?;
                    Ok(WipeSchedule {
                        profile_id: row.get(0)?,
                        cadence_days: row.get::<_, i64>(1)? as u32,
                        last_wipe_at: last.as_deref().and_then(parse_dt),
                        next_wipe_at: None,
                        notes: row.get(3)?,
                    })
                },
            )
            .optional()?;
        Ok(row.map(with_next_wipe))
    })
}

pub fn upsert(
    db: &Db,
    profile_id: &str,
    cadence_days: u32,
    last_wipe_at: Option<DateTime<Utc>>,
    notes: Option<&str>,
) -> Result<WipeSchedule> {
    if cadence_days == 0 || cadence_days > 365 {
        return Err(AppError::invalid_input(
            "cadence must be between 1 and 365 days",
        ));
    }
    db.with_conn(|c| {
        c.execute(
            r#"INSERT INTO wipe_schedules
               (profile_id, cadence_days, last_wipe_at, notes)
               VALUES (?1, ?2, ?3, ?4)
               ON CONFLICT(profile_id) DO UPDATE SET
                 cadence_days = excluded.cadence_days,
                 last_wipe_at = excluded.last_wipe_at,
                 notes        = excluded.notes"#,
            params![
                profile_id,
                cadence_days,
                last_wipe_at.map(|d| d.to_rfc3339()),
                notes,
            ],
        )?;
        Ok(())
    })?;
    Ok(with_next_wipe(WipeSchedule {
        profile_id: profile_id.to_string(),
        cadence_days,
        last_wipe_at,
        next_wipe_at: None,
        notes: notes.map(str::to_string),
    }))
}

/// Set `last_wipe_at = now` (and create a row with default cadence if
/// the user clicks "mark wiped now" before configuring a schedule).
pub fn mark_wiped_now(db: &Db, profile_id: &str) -> Result<WipeSchedule> {
    let existing = get(db, profile_id)?;
    let cadence = existing.as_ref().map(|s| s.cadence_days).unwrap_or(7);
    let notes = existing.and_then(|s| s.notes);
    upsert(db, profile_id, cadence, Some(Utc::now()), notes.as_deref())
}

pub fn delete(db: &Db, profile_id: &str) -> Result<()> {
    db.with_conn(|c| {
        c.execute(
            "DELETE FROM wipe_schedules WHERE profile_id = ?1",
            params![profile_id],
        )?;
        Ok(())
    })
}

fn with_next_wipe(mut s: WipeSchedule) -> WipeSchedule {
    s.next_wipe_at = s
        .last_wipe_at
        .map(|t| t + chrono::Duration::days(s.cadence_days as i64));
    s
}

fn parse_dt(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.with_timezone(&Utc))
}

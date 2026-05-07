//! Activity log — a small append-only audit table so the user can see what
//! the app has done on their behalf (installs, enables, RCON calls, etc.).

use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::database::Db;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityStatus {
    Ok,
    Error,
    Info,
}

impl ActivityStatus {
    fn as_str(self) -> &'static str {
        match self {
            ActivityStatus::Ok => "ok",
            ActivityStatus::Error => "error",
            ActivityStatus::Info => "info",
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "ok" => Self::Ok,
            "error" => Self::Error,
            _ => Self::Info,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: i64,
    pub timestamp: DateTime<Utc>,
    pub profile_id: Option<String>,
    pub action: String,
    pub target: Option<String>,
    pub status: ActivityStatus,
    pub message: Option<String>,
}

pub fn migrate(db: &Db) -> Result<()> {
    db.with_conn(|c| {
        c.execute_batch(
            r#"CREATE TABLE IF NOT EXISTS activity_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT    NOT NULL,
                profile_id  TEXT,
                action      TEXT    NOT NULL,
                target      TEXT,
                status      TEXT    NOT NULL,
                message     TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_log(timestamp DESC);
            "#,
        )?;
        Ok(())
    })
}

pub fn record(
    db: &Db,
    profile_id: Option<&str>,
    action: &str,
    target: Option<&str>,
    status: ActivityStatus,
    message: Option<&str>,
) -> Result<()> {
    db.with_conn(|c| {
        c.execute(
            r#"INSERT INTO activity_log (timestamp, profile_id, action, target, status, message)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
            params![
                Utc::now().to_rfc3339(),
                profile_id,
                action,
                target,
                status.as_str(),
                message,
            ],
        )?;
        Ok(())
    })
}

pub fn list(db: &Db, limit: u32) -> Result<Vec<ActivityEntry>> {
    let limit = limit.clamp(1, 500);
    db.with_conn(|c| {
        let mut stmt = c.prepare(
            r#"SELECT id, timestamp, profile_id, action, target, status, message
               FROM activity_log
               ORDER BY id DESC
               LIMIT ?1"#,
        )?;
        let rows = stmt
            .query_map([limit], |row| {
                let ts: String = row.get(1)?;
                let status: String = row.get(5)?;
                Ok(ActivityEntry {
                    id: row.get(0)?,
                    timestamp: DateTime::parse_from_rfc3339(&ts)
                        .map(|d| d.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    profile_id: row.get(2)?,
                    action: row.get(3)?,
                    target: row.get(4)?,
                    status: ActivityStatus::parse(&status),
                    message: row.get(6)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(AppError::from)?;
        Ok(rows)
    })
}

pub fn clear(db: &Db) -> Result<()> {
    db.with_conn(|c| {
        c.execute("DELETE FROM activity_log", [])?;
        Ok(())
    })
}

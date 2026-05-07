use std::path::Path;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{PluginMetaData, ServerProfile, ServerProfileInput};

/// Tauri-managed handle around a single SQLite connection.
///
/// rusqlite's `Connection` is `!Sync`, so we serialize access through a Mutex.
/// All commands are short-lived enough that this isn't a contention issue in
/// practice for a desktop app.
pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Self(Mutex::new(conn));
        db.migrate()?;
        Ok(db)
    }

    fn with<R>(&self, f: impl FnOnce(&Connection) -> Result<R>) -> Result<R> {
        let guard = self
            .0
            .lock()
            .map_err(|_| AppError::other("database mutex poisoned"))?;
        f(&guard)
    }

    fn migrate(&self) -> Result<()> {
        self.with(|c| {
            c.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS server_profiles (
                    id               TEXT PRIMARY KEY,
                    name             TEXT NOT NULL,
                    ip_address       TEXT NOT NULL,
                    rcon_port        INTEGER NOT NULL,
                    rcon_password    TEXT NOT NULL,
                    server_directory TEXT NOT NULL,
                    created_at       TEXT NOT NULL,
                    updated_at       TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS umod_cache (
                    slug          TEXT PRIMARY KEY,
                    name          TEXT NOT NULL,
                    author        TEXT,
                    version       TEXT,
                    description   TEXT,
                    download_url  TEXT,
                    page_url      TEXT,
                    last_updated  TEXT,
                    cached_at     TEXT NOT NULL
                );
                "#,
            )?;
            Ok(())
        })
    }

    // ----------------------------- Server profiles -----------------------------

    pub fn insert_profile(&self, input: ServerProfileInput) -> Result<ServerProfile> {
        let now = Utc::now();
        let profile = ServerProfile {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            ip_address: input.ip_address,
            rcon_port: input.rcon_port,
            rcon_password: input.rcon_password,
            server_directory: input.server_directory,
            created_at: now,
            updated_at: now,
        };
        self.with(|c| {
            c.execute(
                r#"INSERT INTO server_profiles
                   (id, name, ip_address, rcon_port, rcon_password,
                    server_directory, created_at, updated_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
                params![
                    profile.id,
                    profile.name,
                    profile.ip_address,
                    profile.rcon_port,
                    profile.rcon_password,
                    profile.server_directory,
                    profile.created_at.to_rfc3339(),
                    profile.updated_at.to_rfc3339(),
                ],
            )?;
            Ok(())
        })?;
        Ok(profile)
    }

    pub fn update_profile(&self, profile: ServerProfile) -> Result<ServerProfile> {
        let updated = ServerProfile {
            updated_at: Utc::now(),
            ..profile
        };
        let rows = self.with(|c| {
            c.execute(
                r#"UPDATE server_profiles
                   SET name=?2, ip_address=?3, rcon_port=?4, rcon_password=?5,
                       server_directory=?6, updated_at=?7
                   WHERE id=?1"#,
                params![
                    updated.id,
                    updated.name,
                    updated.ip_address,
                    updated.rcon_port,
                    updated.rcon_password,
                    updated.server_directory,
                    updated.updated_at.to_rfc3339(),
                ],
            )
            .map_err(AppError::from)
        })?;
        if rows == 0 {
            return Err(AppError::not_found(format!("profile {}", updated.id)));
        }
        Ok(updated)
    }

    pub fn delete_profile(&self, id: &str) -> Result<()> {
        let rows = self.with(|c| {
            c.execute("DELETE FROM server_profiles WHERE id=?1", params![id])
                .map_err(AppError::from)
        })?;
        if rows == 0 {
            return Err(AppError::not_found(format!("profile {id}")));
        }
        Ok(())
    }

    pub fn get_all_profiles(&self) -> Result<Vec<ServerProfile>> {
        self.with(|c| {
            let mut stmt = c.prepare(
                r#"SELECT id, name, ip_address, rcon_port, rcon_password,
                          server_directory, created_at, updated_at
                   FROM server_profiles
                   ORDER BY name COLLATE NOCASE ASC"#,
            )?;
            let rows = stmt
                .query_map([], row_to_profile)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn get_profile_by_id(&self, id: &str) -> Result<Option<ServerProfile>> {
        self.with(|c| {
            let p = c
                .query_row(
                    r#"SELECT id, name, ip_address, rcon_port, rcon_password,
                              server_directory, created_at, updated_at
                       FROM server_profiles WHERE id=?1"#,
                    params![id],
                    row_to_profile,
                )
                .optional()?;
            Ok(p)
        })
    }

    // -------------------------------- uMod cache -------------------------------

    /// Replace the entire cache for the given list. Caller is expected to
    /// pass a complete page worth (or the full result set) at once.
    pub fn upsert_umod_cache(&self, items: &[PluginMetaData]) -> Result<()> {
        self.with(|c| {
            let now = Utc::now().to_rfc3339();
            let tx = c.unchecked_transaction()?;
            for it in items {
                tx.execute(
                    r#"INSERT INTO umod_cache
                       (slug, name, author, version, description,
                        download_url, page_url, last_updated, cached_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                       ON CONFLICT(slug) DO UPDATE SET
                         name=excluded.name,
                         author=excluded.author,
                         version=excluded.version,
                         description=excluded.description,
                         download_url=excluded.download_url,
                         page_url=excluded.page_url,
                         last_updated=excluded.last_updated,
                         cached_at=excluded.cached_at"#,
                    params![
                        it.slug,
                        it.name,
                        it.author,
                        it.version,
                        it.description,
                        it.download_url,
                        it.page_url,
                        it.last_updated.map(|d| d.to_rfc3339()),
                        now,
                    ],
                )?;
            }
            tx.commit()?;
            Ok(())
        })
    }

    pub fn list_umod_cache(&self) -> Result<Vec<PluginMetaData>> {
        self.with(|c| {
            let mut stmt = c.prepare(
                r#"SELECT slug, name, author, version, description,
                          download_url, page_url, last_updated
                   FROM umod_cache
                   ORDER BY name COLLATE NOCASE ASC"#,
            )?;
            let rows = stmt
                .query_map([], row_to_meta)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            Ok(rows)
        })
    }

    pub fn get_umod_by_slug(&self, slug: &str) -> Result<Option<PluginMetaData>> {
        self.with(|c| {
            let m = c
                .query_row(
                    r#"SELECT slug, name, author, version, description,
                              download_url, page_url, last_updated
                       FROM umod_cache WHERE slug=?1"#,
                    params![slug],
                    row_to_meta,
                )
                .optional()?;
            Ok(m)
        })
    }
}

fn row_to_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<ServerProfile> {
    Ok(ServerProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        ip_address: row.get(2)?,
        rcon_port: row.get::<_, i64>(3)? as u16,
        rcon_password: row.get(4)?,
        server_directory: row.get(5)?,
        created_at: parse_dt(&row.get::<_, String>(6)?),
        updated_at: parse_dt(&row.get::<_, String>(7)?),
    })
}

fn row_to_meta(row: &rusqlite::Row<'_>) -> rusqlite::Result<PluginMetaData> {
    let last_updated: Option<String> = row.get(7)?;
    Ok(PluginMetaData {
        slug: row.get(0)?,
        name: row.get(1)?,
        author: row.get(2)?,
        version: row.get(3)?,
        description: row.get(4)?,
        download_url: row.get(5)?,
        page_url: row.get(6)?,
        last_updated: last_updated.as_deref().map(parse_dt),
    })
}

fn parse_dt(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s)
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

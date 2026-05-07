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

    /// Run the given closure under the connection lock. Other modules use
    /// this to add their own SQL on top of the core schema.
    pub fn with_conn<R>(&self, f: impl FnOnce(&Connection) -> Result<R>) -> Result<R> {
        let guard = self
            .0
            .lock()
            .map_err(|_| AppError::other("database mutex poisoned"))?;
        f(&guard)
    }

    fn with<R>(&self, f: impl FnOnce(&Connection) -> Result<R>) -> Result<R> {
        self.with_conn(f)
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
            // Idempotent forward-migrations for users who created the DB on
            // an older schema. SQLite returns a "duplicate column name"
            // error when the column already exists; that's our success case.
            add_column_if_missing(c, "server_profiles", "notes", "TEXT")?;
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
            notes: input.notes.filter(|s| !s.is_empty()),
            created_at: now,
            updated_at: now,
        };
        self.insert_profile_full(&profile)?;
        Ok(profile)
    }

    /// Insert a fully-formed profile (id + timestamps already set). Used by
    /// the import path so we keep timestamps from the source machine.
    pub fn insert_profile_full(&self, p: &ServerProfile) -> Result<()> {
        self.with(|c| {
            c.execute(
                r#"INSERT INTO server_profiles
                   (id, name, ip_address, rcon_port, rcon_password,
                    server_directory, notes, created_at, updated_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                   ON CONFLICT(id) DO UPDATE SET
                     name=excluded.name,
                     ip_address=excluded.ip_address,
                     rcon_port=excluded.rcon_port,
                     rcon_password=excluded.rcon_password,
                     server_directory=excluded.server_directory,
                     notes=excluded.notes,
                     updated_at=excluded.updated_at"#,
                params![
                    p.id,
                    p.name,
                    p.ip_address,
                    p.rcon_port,
                    p.rcon_password,
                    p.server_directory,
                    p.notes,
                    p.created_at.to_rfc3339(),
                    p.updated_at.to_rfc3339(),
                ],
            )?;
            Ok(())
        })
    }

    pub fn update_profile(&self, profile: ServerProfile) -> Result<ServerProfile> {
        let updated = ServerProfile {
            updated_at: Utc::now(),
            notes: profile.notes.filter(|s| !s.is_empty()),
            ..profile
        };
        let rows = self.with(|c| {
            c.execute(
                r#"UPDATE server_profiles
                   SET name=?2, ip_address=?3, rcon_port=?4, rcon_password=?5,
                       server_directory=?6, notes=?7, updated_at=?8
                   WHERE id=?1"#,
                params![
                    updated.id,
                    updated.name,
                    updated.ip_address,
                    updated.rcon_port,
                    updated.rcon_password,
                    updated.server_directory,
                    updated.notes,
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
                          server_directory, notes, created_at, updated_at
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
                              server_directory, notes, created_at, updated_at
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
        notes: row.get(6)?,
        created_at: parse_dt(&row.get::<_, String>(7)?),
        updated_at: parse_dt(&row.get::<_, String>(8)?),
    })
}

/// `ALTER TABLE … ADD COLUMN` is non-idempotent in SQLite — calling twice
/// returns "duplicate column name", which we swallow so first-run upgrades
/// from an older schema are seamless.
fn add_column_if_missing(
    c: &Connection,
    table: &str,
    column: &str,
    type_decl: &str,
) -> Result<()> {
    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {type_decl}");
    match c.execute(&sql, []) {
        Ok(_) => Ok(()),
        Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
            if msg.contains("duplicate column name") =>
        {
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
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

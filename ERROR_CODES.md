# Error codes

Every failure surfaced to the UI carries a stable code (`CATEGORY-NNN`). When
a user reports a bug, the toast displays `<message> [CODE]` — the code is what
to ask for first; it pinpoints the exact failure mode without needing logs or
a stack trace.

Codes never change once published. New failure modes get **new** codes, never
reuse an existing one. Source of truth: `src-tauri/src/error.rs`.

---

## DB — database / persistence

| Code     | Variant            | Meaning |
|----------|--------------------|---------|
| `DB-001` | `Database(_)`      | rusqlite returned an error (constraint violation, malformed SQL, locked DB, etc.). The message contains rusqlite's own diagnostic. |
| `DB-002` | `DatabasePoisoned` | Internal: the SQLite connection mutex was poisoned by a panic in another thread. Recoverable only by restarting the app. |

## FS — local filesystem

I/O errors are mapped to a code based on `std::io::ErrorKind`. The message
preserves the OS-level reason.

| Code     | Kind                     | Meaning |
|----------|--------------------------|---------|
| `FS-001` | `NotFound`               | Path doesn't exist. Most often: server directory misconfigured, or `oxide/plugins/` is empty. |
| `FS-002` | `PermissionDenied`       | The OS refused the read/write. Check file permissions or whether the user the app runs as can touch the server install. |
| `FS-003` | `AlreadyExists`          | A create-only operation hit an existing file. Currently rare — only triggered if a backup-rename collides. |
| `FS-004` | `TimedOut`               | Network filesystem (NFS / SMB) timed out. Almost always indicates a hung mount. |
| `FS-099` | _other I/O_              | Anything else. The message has the OS error text. |

## STORE — uMod store / network

| Code         | Meaning |
|--------------|---------|
| `STORE-001`  | `reqwest` errored before/while reading the response (timeout, DNS, TLS, 4xx/5xx status). Often Cloudflare blocking — try again later. |
| `STORE-002`  | uMod returned a 200 but the body wasn't valid JSON in the shape we expect. Usually means uMod changed their API; file an issue. |
| `STORE-003`  | The cached plugin entry has no `download_url`. uMod hasn't published a release yet — wait for the author to upload one. |

## SERIAL — serialization

| Code           | Meaning |
|----------------|---------|
| `SERIAL-001`   | `serde_json` couldn't parse a JSON payload. Malformed JSON in a config or import file. |
| `SERIAL-002`   | `semver` couldn't parse a version string. A plugin's `[Info(...)]` version isn't valid semver. |
| `SERIAL-003`   | URL parse failed. Usually means a malformed `download_url` came back from the store. |

## RCON — Rust RCON websocket

| Code        | Meaning |
|-------------|---------|
| `RCON-001`  | Couldn't open the websocket within 5s. Server unreachable, wrong port, or RCON disabled. |
| `RCON-002`  | Connected but no matching reply within 5s. Server is alive but slow / busy / wedged. |
| `RCON-003`  | Server closed the connection before our reply arrived. Often: wrong RCON password (server rejects then closes). |
| `RCON-004`  | TLS / frame parsing error from `tokio-tungstenite`. |

## PLUGIN — installed plugins

| Code          | Meaning |
|---------------|---------|
| `PLUGIN-001`  | A plugin name contained `..`, `/`, `\`, or null. Refused so a malicious server response can't escape `oxide/plugins/`. |
| `PLUGIN-002`  | Plugin not found in `oxide/plugins/` (or `disabled/`, depending on the operation). |
| `PLUGIN-003`  | Couldn't extract a plugin name from a `.cs` file. The file has no `[Info(...)]` and no usable filename stem. |

## CONFIG — plugin configs

| Code          | Meaning |
|---------------|---------|
| `CONFIG-001`  | The content the user tried to save isn't valid JSON. Save was refused — the file on disk is unchanged. |
| `CONFIG-002`  | Same, but for INI. |
| `CONFIG-003`  | The config file `oxide/config/<plugin>.{json,ini}` doesn't exist. |

## BACKUP — config snapshots

| Code          | Meaning |
|---------------|---------|
| `BACKUP-001`  | The named backup file isn't in `oxide/config/.rustapp-backups/`. |
| `BACKUP-002`  | The provided `fileName` resolves outside the backups dir. Refused as a path-traversal guard — should never trigger from the UI. |

## PROFILE — server profiles & saved commands

| Code           | Meaning |
|----------------|---------|
| `PROFILE-001`  | No `server_profiles` row matches the given id. Usually means the active profile was deleted in another window. |
| `PROFILE-002`  | No `saved_commands` row matches the given id. |

## IMPORT — profile import / export

| Code          | Meaning |
|---------------|---------|
| `IMPORT-001`  | The file passed to `import_profiles_from_path` isn't a valid RustApp export. The message has the JSON parse error. |
| `IMPORT-002`  | The export was written by a newer version of RustApp than this one. Upgrade and try again. |

## INPUT — invalid command argument

| Code         | Meaning |
|--------------|---------|
| `INPUT-001`  | A command argument failed validation (empty `label` on a saved command, etc.). |

## INTERNAL — last resort

| Code             | Meaning |
|------------------|---------|
| `INTERNAL-001`   | Reserved for unanticipated failures. If you see this, please file a bug — the right move is to add a new specific code. |

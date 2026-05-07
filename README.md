# RustApp — uMod Plugin Manager for Rust Servers

A clean, modern desktop app to discover, install, configure, update and audit
server-side **uMod (Oxide) plugins** on Rust game servers.

Built with **Tauri 2** + **React 18 + TypeScript + Vite + Zustand + lucide-react**.

## Features

- **Server profiles** — multiple servers, RCON test, native folder picker, SQLite-backed
- **Live dashboard** — players online, map, framerate, uptime, dependency health, recent activity
- **Installed plugins** — search, filter (all / enabled / disabled / updates), enable, disable,
  reload, uninstall (with optional config purge)
- **Bulk update** — one-click "update all" with per-plugin failure reporting
- **Config editor** — JSON / INI with format validation, automatic backups under
  `oxide/config/.rustapp-backups/` (last 10 kept)
- **Plugin Store** — browse and search uMod, paginated, install in one click
- **RCON Console** — free-form command shell with arrow-up history
- **Players** — live list with kick / ban actions, auto-refreshes every 15s
- **Activity Log** — every install/update/RCON action appended to a SQLite audit table
- **Light & dark themes** — CSS variable-based, persisted
- **GitHub Actions** — cross-platform installer build (Windows .msi + .exe, macOS .dmg, Linux .deb + .AppImage)

## Architecture

```
RustApp/
├── .github/workflows/release.yml   Cross-platform installer build via tauri-action
├── src-tauri/                      Rust backend (Tauri host)
│   ├── src/
│   │   ├── main.rs / lib.rs        Entry, builder, invoke_handler
│   │   ├── error.rs                AppError + Result alias (thiserror)
│   │   ├── models.rs               camelCase wire types shared with TS
│   │   ├── database.rs             SQLite (rusqlite) — profiles + uMod cache
│   │   ├── activity.rs             Audit log table + read/clear/record API
│   │   ├── rcon.rs                 WebSocket RCON, serverinfo + playerlist parsing
│   │   ├── plugins.rs              Scan oxide/plugins{,/disabled}, install, uninstall
│   │   ├── config_files.rs         Read/write configs, backup-before-save, list backups
│   │   ├── umod_scraper.rs         reqwest + scraper for the uMod store
│   │   ├── dependencies.rs         Check RustDedicated_Data/Managed/*.dll
│   │   ├── utils.rs                Path helpers, semver, plugin-name validation
│   │   └── commands.rs             #[tauri::command] surface (~25 commands)
│   ├── capabilities/default.json
│   └── tauri.conf.json
│
├── src/                            React frontend
│   ├── main.tsx / App.tsx          Router shell
│   ├── api/tauriCommands.ts        Typed invoke() wrappers
│   ├── types/models.ts             Mirror of Rust models
│   ├── state/                      Zustand stores: server, theme, updates
│   ├── components/                 Reusable UI: Modal, Toast, Skeleton, EmptyState…
│   ├── components/layout/          Sidebar + TopBar
│   ├── pages/                      Dashboard, InstalledPlugins, PluginStore,
│   │                               Console, Players, Activity, Settings
│   └── styles/globals.css          Theme tokens + utility classes
│
└── TODO.md                         Original plan that drove the scaffold
```

## Prerequisites

- **Rust** stable (1.77+)
- **Node 18+** (developed against Node 22)
- Platform deps for Tauri 2 — see <https://tauri.app/start/prerequisites/>

## Development

```bash
npm install
npm run tauri dev          # full app
npm run dev                # frontend only (browser, no IPC)
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

## Building

```bash
npm run tauri build
```

CI (`.github/workflows/release.yml`) builds Windows `.msi` and `.exe` (NSIS),
macOS `.dmg`, and Linux `.deb` + `.AppImage` on every push to `main` and on
manual dispatch. Tag pushes (`v*`) additionally publish a draft GitHub release
with the artifacts attached.

## Known caveats

1. **uMod scraper selectors** in `umod_scraper.rs` are best-guess against the
   public layout — verify them once you can run against the live HTML.
2. **Icons** in `src-tauri/icons/` are 1-color placeholders; replace via
   `cargo tauri icon path/to/real.png`.
3. **RCON passwords** are stored plaintext in SQLite — a follow-up should
   switch to the OS keychain via the `keyring` crate.

# RustApp — uMod Plugin Manager for Rust Servers

Desktop app to discover, install, update, and manage server-side **uMod (Oxide) plugins** for Rust game servers.

Built with **Tauri 2** + **React 18 + TypeScript + Vite**.

## Architecture

```
RustApp/
├── src-tauri/                  Rust backend (Tauri host)
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/           Tauri v2 capability files
│   └── src/
│       ├── main.rs             Entry — calls into lib::run()
│       ├── lib.rs              Tauri builder, invoke_handler, state
│       ├── error.rs            AppError + Result alias (thiserror)
│       ├── models.rs           Serde structs shared with frontend
│       ├── database.rs         SQLite (rusqlite) — profiles + cache
│       ├── rcon.rs             RCON client (websocket) — connect/send
│       ├── plugins.rs          Scan oxide/plugins{,/disabled} for .cs
│       ├── config_files.rs     Read/write oxide/config/<plugin>.{json,ini}
│       ├── umod_scraper.rs     reqwest + scraper for uMod store
│       ├── dependencies.rs     Check RustDedicated_Data/Managed/*.dll
│       ├── utils.rs            Path helpers, version helpers
│       └── commands.rs         #[tauri::command] surface
│
├── src/                        React frontend
│   ├── main.tsx                React entry
│   ├── App.tsx                 Router shell
│   ├── api/tauriCommands.ts    invoke() wrappers
│   ├── types/models.ts         Mirror of Rust models
│   ├── state/serverStore.ts    Zustand store (selected profile etc.)
│   ├── components/             Reusable UI
│   ├── pages/                  Routed views (Dashboard / Settings / …)
│   └── styles/                 Global CSS
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── TODO.md                     Original step-by-step plan
```

## Prerequisites

- **Rust** stable (1.77+) and a working C toolchain
- **Node 18+** (developed against Node 22)
- Platform deps for Tauri 2 — see <https://tauri.app/start/prerequisites/>

## Development

```bash
# install JS deps
npm install

# run the dev app (Vite dev server + Tauri host)
npm run tauri dev

# type-check the frontend
npm run typecheck

# check the backend
cargo check --manifest-path src-tauri/Cargo.toml
```

## Building

```bash
npm run tauri build
```

## Status

Scaffold of all 9 planning steps from `TODO.md` is in place. Modules expose
their commands and have working stubs / partial implementations; see
individual files for `TODO:` markers indicating where domain-specific logic
still needs to land (uMod selectors, dependency list per Rust release, etc.).

// Injected via Playwright's `addInitScript` *before* the React app boots.
// Replaces the real Tauri IPC bridge with deterministic mock data so a
// headless browser can render every page without a Tauri host.
//
// Lives outside src/ so the app's tsconfig doesn't try to compile it. Plain
// JS — Playwright reads the file as a string and passes it to Chromium's
// `Page.addScriptToEvaluateOnNewDocument`.

(() => {
  const PROFILES = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Main PvP Server",
      ipAddress: "203.0.113.42",
      rconPort: 28016,
      rconPassword: "redacted",
      serverDirectory: "/srv/rust/main",
      notes:
        "Wipe Thursdays at 18:00 UTC. 2x gather, 2x stack. Tell @ops before changing rates — they have alerting tied to the server name.",
      createdAt: "2026-01-15T12:00:00.000Z",
      updatedAt: "2026-04-30T09:14:33.000Z",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Build Test Server",
      ipAddress: "127.0.0.1",
      rconPort: 28017,
      rconPassword: "redacted",
      serverDirectory: "/srv/rust/test",
      notes: null,
      createdAt: "2026-02-01T10:00:00.000Z",
      updatedAt: "2026-04-29T18:00:00.000Z",
    },
  ];

  const INSTALLED = [
    { name: "Vanish",         author: "Whispers88",      version: "1.7.0",  description: "Allows players with permission to become invisible.",  filePath: "/srv/rust/main/oxide/plugins/Vanish.cs",         enabled: true,  hasConfig: true  },
    { name: "Kits",           author: "k1lly0u",         version: "4.2.4",  description: "Loadout system for players, with permissions and cooldowns.", filePath: "/srv/rust/main/oxide/plugins/Kits.cs",         enabled: true,  hasConfig: true  },
    { name: "ZoneManager",    author: "k1lly0u",         version: "3.0.34", description: "Define areas of the map and apply rules to players in them.", filePath: "/srv/rust/main/oxide/plugins/ZoneManager.cs", enabled: true,  hasConfig: true  },
    { name: "RemoverTool",    author: "Reneb, Fuji",     version: "5.0.4",  description: "Lets players remove deployables they own.",            filePath: "/srv/rust/main/oxide/plugins/RemoverTool.cs",   enabled: true,  hasConfig: true  },
    { name: "Backpacks",      author: "WhiteThunder",    version: "3.13.4", description: "Gives players a backpack accessible from anywhere.",   filePath: "/srv/rust/main/oxide/plugins/Backpacks.cs",     enabled: true,  hasConfig: true  },
    { name: "ServerRewards",  author: "k1lly0u",         version: "1.6.0",  description: "Reward currency, store, and exchange for the server.", filePath: "/srv/rust/main/oxide/plugins/ServerRewards.cs", enabled: false, hasConfig: true  },
    { name: "DiscordCore",    author: "MJSU",            version: "2.0.10", description: "Shared Discord bot framework other plugins depend on.", filePath: "/srv/rust/main/oxide/plugins/DiscordCore.cs",   enabled: true,  hasConfig: true  },
    { name: "BetterChat",     author: "LaserHydra",      version: "5.2.7",  description: "Customisable chat formatting + permissions.",          filePath: "/srv/rust/main/oxide/plugins/BetterChat.cs",    enabled: true,  hasConfig: true  },
    { name: "Clans",          author: "k1lly0u",         version: "0.5.6",  description: "Player-run clans, with chat, ally lists and TC sharing.", filePath: "/srv/rust/main/oxide/plugins/Clans.cs",     enabled: true,  hasConfig: true  },
    { name: "PlaytimeTracker",author: "MJSU",            version: "0.4.1",  description: "Tracks playtime per Steam ID.",                        filePath: "/srv/rust/main/oxide/plugins/PlaytimeTracker.cs", enabled: false, hasConfig: false },
  ];

  const STORE_ITEMS = [
    { slug: "vanish",        name: "Vanish",         author: "Whispers88",  version: "1.7.0",  description: "Allows players with permission to become invisible from other players, AI and most things.", downloadUrl: "https://umod.org/plugins/vanish/download/1.7.0",       pageUrl: "https://umod.org/plugins/vanish",        lastUpdated: "2026-04-12T09:14:33.000Z" },
    { slug: "kits",          name: "Kits",           author: "k1lly0u",     version: "4.2.4",  description: "Comprehensive kit system with permissions, cooldowns, autokits and a UI.",                  downloadUrl: "https://umod.org/plugins/kits/download/4.2.4",         pageUrl: "https://umod.org/plugins/kits",          lastUpdated: "2026-04-04T17:21:00.000Z" },
    { slug: "zone-manager",  name: "ZoneManager",    author: "k1lly0u",     version: "3.0.34", description: "Create custom zones on the map and apply behaviour to players inside them.",                downloadUrl: "https://umod.org/plugins/zone-manager/download/3.0.34", pageUrl: "https://umod.org/plugins/zone-manager",  lastUpdated: "2026-03-30T22:11:00.000Z" },
    { slug: "remover-tool",  name: "RemoverTool",    author: "Reneb",       version: "5.0.4",  description: "Allows players to remove deployables they own with a configurable cost.",                  downloadUrl: "https://umod.org/plugins/remover-tool/download/5.0.4", pageUrl: "https://umod.org/plugins/remover-tool",  lastUpdated: "2026-03-22T11:08:00.000Z" },
    { slug: "backpacks",     name: "Backpacks",      author: "WhiteThunder", version: "3.13.4", description: "Each player gets a personal backpack with a configurable size and admin tools.",           downloadUrl: "https://umod.org/plugins/backpacks/download/3.13.4",   pageUrl: "https://umod.org/plugins/backpacks",     lastUpdated: "2026-04-18T15:00:00.000Z" },
    { slug: "server-rewards",name: "ServerRewards",  author: "k1lly0u",     version: "1.6.0",  description: "Server points / currency framework. Reward players for play time and kills.",              downloadUrl: "https://umod.org/plugins/server-rewards/download/1.6.0", pageUrl: "https://umod.org/plugins/server-rewards", lastUpdated: "2026-02-14T08:30:00.000Z" },
    { slug: "discord-core",  name: "DiscordCore",    author: "MJSU",        version: "2.0.10", description: "Lets other plugins push events to Discord and read commands back.",                         downloadUrl: "https://umod.org/plugins/discord-core/download/2.0.10", pageUrl: "https://umod.org/plugins/discord-core",  lastUpdated: "2026-04-21T13:00:00.000Z" },
    { slug: "better-chat",   name: "BetterChat",     author: "LaserHydra",  version: "5.2.7",  description: "Override chat formatting based on permission groups.",                                     downloadUrl: "https://umod.org/plugins/better-chat/download/5.2.7", pageUrl: "https://umod.org/plugins/better-chat",   lastUpdated: "2026-03-18T19:00:00.000Z" },
    { slug: "clans",         name: "Clans",          author: "k1lly0u",     version: "0.5.6",  description: "Player-run clans with chat, allies and shared TC authorisation.",                          downloadUrl: "https://umod.org/plugins/clans/download/0.5.6",       pageUrl: "https://umod.org/plugins/clans",         lastUpdated: "2026-02-01T07:00:00.000Z" },
  ];

  const PLAYERS = [
    { steamId: "76561198000000001", name: "kaidoh",       ping: 32,  connectedSeconds: 8420,  address: "203.0.113.10:51221"  },
    { steamId: "76561198000000002", name: "puddingcup",   ping: 41,  connectedSeconds: 14770, address: "198.51.100.42:55001" },
    { steamId: "76561198000000003", name: "northcoast",   ping: 58,  connectedSeconds: 1230,  address: "192.0.2.71:60412"    },
    { steamId: "76561198000000004", name: "Roof_Camper",  ping: 102, connectedSeconds: 22310, address: "203.0.113.88:50118"  },
    { steamId: "76561198000000005", name: "Sister_Stoned",ping: 19,  connectedSeconds: 47210, address: "198.51.100.4:51000"  },
  ];

  const ACTIVITY = [
    { id: 14, timestamp: "2026-05-07T11:08:14.000Z", profileId: PROFILES[0].id, action: "plugin.update_all",  target: null,                    status: "ok",    message: "2 updated, 0 failed" },
    { id: 13, timestamp: "2026-05-07T11:07:55.000Z", profileId: PROFILES[0].id, action: "rcon.command",       target: "save.all",              status: "ok",    message: "Saving complete" },
    { id: 12, timestamp: "2026-05-07T10:54:02.000Z", profileId: PROFILES[0].id, action: "config.save",        target: "Vanish",                status: "ok",    message: "612 bytes" },
    { id: 11, timestamp: "2026-05-07T10:51:00.000Z", profileId: PROFILES[0].id, action: "plugin.uninstall",   target: "PlaytimeTrackerLegacy", status: "ok",    message: "removed 2 file(s)" },
    { id: 10, timestamp: "2026-05-07T10:30:11.000Z", profileId: PROFILES[0].id, action: "rcon.test",          target: "Main PvP Server",       status: "ok",    message: "Server is up" },
    { id:  9, timestamp: "2026-05-07T09:12:08.000Z", profileId: PROFILES[1].id, action: "rcon.test",          target: "Build Test Server",    status: "error", message: "RCON connect timed out" },
    { id:  8, timestamp: "2026-05-06T22:01:00.000Z", profileId: PROFILES[0].id, action: "config.save",        target: "Kits",                  status: "ok",    message: "1.4 KB" },
    { id:  7, timestamp: "2026-05-06T21:58:42.000Z", profileId: PROFILES[0].id, action: "plugin.disable",     target: "ServerRewards",         status: "ok",    message: null },
  ];

  const UPDATES = [
    { pluginName: "Vanish",      installedVersion: "1.6.0", latestVersion: "1.7.0",  downloadUrl: "https://umod.org/plugins/vanish/download/1.7.0" },
    { pluginName: "Backpacks",   installedVersion: "3.12.1",latestVersion: "3.13.4", downloadUrl: "https://umod.org/plugins/backpacks/download/3.13.4" },
  ];

  const SAVED_COMMANDS = [
    { id: 1, profileId: PROFILES[0].id, label: "save world",       command: "save.all",                createdAt: "2026-04-12T09:00:00.000Z" },
    { id: 2, profileId: PROFILES[0].id, label: "list players",     command: "playerlist",              createdAt: "2026-04-12T09:00:30.000Z" },
    { id: 3, profileId: PROFILES[0].id, label: "wipe map (admin)", command: "server.wipemap",          createdAt: "2026-04-12T09:01:00.000Z" },
    { id: 4, profileId: PROFILES[0].id, label: "show banlist",     command: "global.banlistex",        createdAt: "2026-04-12T09:01:30.000Z" },
    { id: 5, profileId: PROFILES[0].id, label: "reload all",       command: "oxide.reload *",          createdAt: "2026-04-12T09:02:00.000Z" },
  ];

  const handlers = {
    // ---------- profiles + RCON ----------
    get_server_profiles: () => PROFILES,
    get_server_profile: (a) => PROFILES.find((p) => p.id === a.id) ??
      Promise.reject({ code: "PROFILE-001", category: "PROFILE", message: `profile not found: ${a.id}` }),
    add_server_profile: (a) => ({
      id: "33333333-3333-3333-3333-333333333333",
      ...a.profile,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    update_server_profile: (a) => ({ ...a.profile, updatedAt: new Date().toISOString() }),
    delete_server_profile: () => null,
    test_rcon_connection: () => ({ ok: true, serverResponse: "Server is up: Build 80123 / Oxide 2.0.6191", elapsedMs: 42 }),
    send_rcon_command: (a) => ({ command: a.command, response: "(mocked response)\nNothing to do, world is saved.", elapsedMs: 8 }),
    get_server_status: () => ({
      hostname: "Main PvP Server | 2x | Weekly Wipe",
      map: "Procedural Map (4500)",
      players: 87,
      maxPlayers: 150,
      queued: 4,
      joining: 2,
      uptimeSeconds: 432_900,
      framerate: 58.7,
      raw: '{"Hostname":"Main PvP Server","Map":"Procedural Map","Players":87}',
    }),
    get_player_list: () => PLAYERS,

    // ---------- installed plugins ----------
    get_installed_plugins: () => INSTALLED,
    enable_plugin: () => null,
    disable_plugin: () => null,
    reload_plugin: () => "Plugin reloaded.",
    uninstall_plugin: (a) => [`/srv/rust/main/oxide/plugins/${a.pluginName}.cs`],

    // ---------- configs ----------
    load_plugin_config: () =>
      JSON.stringify(
        {
          Settings: { BroadcastOnVanish: true, ResetCooldown: 600, NotifyAdmins: true },
          Permissions: { use: "vanish.use", admin: "vanish.admin" },
        },
        null,
        2,
      ),
    save_plugin_config: () => null,
    list_config_backups: () => [
      { fileName: "Vanish-20260507T105402.json", path: "/srv/rust/main/oxide/config/.rustapp-backups/Vanish-20260507T105402.json", sizeBytes: 612, modified: "2026-05-07T10:54:02.000Z" },
      { fileName: "Vanish-20260506T220100.json", path: "/srv/rust/main/oxide/config/.rustapp-backups/Vanish-20260506T220100.json", sizeBytes: 598, modified: "2026-05-06T22:01:00.000Z" },
      { fileName: "Vanish-20260430T090000.json", path: "/srv/rust/main/oxide/config/.rustapp-backups/Vanish-20260430T090000.json", sizeBytes: 580, modified: "2026-04-30T09:00:00.000Z" },
    ],
    read_config_backup: () => '{ "Settings": { "BroadcastOnVanish": false } }',
    restore_config_backup: () => null,

    // ---------- store ----------
    fetch_umod_plugins: () => ({ items: STORE_ITEMS, page: 1, hasNext: true }),
    list_cached_umod_plugins: () => STORE_ITEMS,
    install_plugin: (a) => {
      const meta = STORE_ITEMS.find((p) => p.slug === a.pluginSlug) ?? STORE_ITEMS[0];
      return {
        name: meta.name,
        author: meta.author,
        version: meta.version,
        description: meta.description,
        filePath: `/srv/rust/main/oxide/plugins/${meta.name}.cs`,
        enabled: true,
        hasConfig: false,
      };
    },

    // ---------- updates / deps ----------
    check_for_plugin_updates: () => UPDATES,
    update_all_plugins: () => ({ updated: ["Vanish", "Backpacks"], failed: [] }),
    check_common_dependencies: () => ({
      managedDir: "/srv/rust/main/RustDedicated_Data/Managed",
      present: ["Newtonsoft.Json.dll", "Oxide.Core.dll", "Oxide.Rust.dll", "Oxide.References.dll", "Oxide.CSharp.dll", "Assembly-CSharp.dll", "UnityEngine.dll"],
      missing: [],
    }),

    // ---------- activity log ----------
    list_activity: () => ACTIVITY,
    clear_activity: () => null,

    // ---------- saved commands ----------
    list_saved_commands: () => SAVED_COMMANDS,
    add_saved_command: (a) => ({
      id: 99,
      profileId: a.profileId,
      label: a.label,
      command: a.command,
      createdAt: new Date().toISOString(),
    }),
    delete_saved_command: () => null,

    // ---------- import / export ----------
    export_profiles_to_path: () => 2,
    import_profiles_from_path: () => 2,

    // ---------- @tauri-apps/plugin-dialog ----------
    "plugin:dialog|open": () => "/srv/rust/picked-folder",
    "plugin:dialog|save": () => "/tmp/rustapp-profiles.json",
  };

  window.__TAURI_INTERNALS__ = {
    invoke: (cmd, args = {}) => {
      const h = handlers[cmd];
      if (!h) {
        // Unmocked — pretend it's a backend AppError so the toast shows
        // a code instead of "[object Object]".
        return Promise.reject({
          code: "MOCK-001",
          category: "MOCK",
          message: `no mock for ${cmd}`,
        });
      }
      try {
        const result = h(args || {});
        return Promise.resolve(result);
      } catch (e) {
        return Promise.reject(e);
      }
    },
    transformCallback: (callback) => callback,
  };

  // Pre-seed Zustand-persist'ed stores so the dashboard has an active server
  // and the dark theme is applied before the first paint.
  try {
    window.localStorage.setItem(
      "rustapp:server-store",
      JSON.stringify({ state: { selectedId: PROFILES[0].id }, version: 0 }),
    );
    window.localStorage.setItem(
      "rustapp:theme",
      JSON.stringify({ state: { theme: "dark" }, version: 0 }),
    );
  } catch {
    // SSR / sandboxed contexts — ignore.
  }
})();

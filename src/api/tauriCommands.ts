// Thin wrappers around `invoke()` so call sites get type-checked arguments
// and typed return values. The command names match the snake_case names
// registered in `src-tauri/src/lib.rs`.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActivityEntry,
  BanInfo,
  BulkUpdateResult,
  ConfigBackup,
  ConfigKind,
  DependencyStatus,
  InstallArgs,
  InstallProgress,
  InstalledPlugin,
  LaunchSettings,
  PlayerInfo,
  PluginMetaData,
  PluginStorePage,
  PluginUpdateInfo,
  RconCommandResult,
  RconTestResult,
  SavedCommand,
  ServerLogEvent,
  ServerProfile,
  ServerProfileInput,
  ServerStateEvent,
  ServerStatus,
  WipeSchedule,
} from "@/types/models";

// ---------- Server profiles ----------

export const addServerProfile = (profile: ServerProfileInput) =>
  invoke<ServerProfile>("add_server_profile", { profile });

export const updateServerProfile = (profile: ServerProfile) =>
  invoke<ServerProfile>("update_server_profile", { profile });

export const deleteServerProfile = (id: string) =>
  invoke<void>("delete_server_profile", { id });

export const getServerProfiles = () =>
  invoke<ServerProfile[]>("get_server_profiles");

export const getServerProfile = (id: string) =>
  invoke<ServerProfile>("get_server_profile", { id });

export const testRconConnection = (profileId: string) =>
  invoke<RconTestResult>("test_rcon_connection", { profileId });

export const sendRconCommand = (profileId: string, command: string) =>
  invoke<RconCommandResult>("send_rcon_command", { profileId, command });

export const getServerStatus = (profileId: string) =>
  invoke<ServerStatus>("get_server_status", { profileId });

export const getPlayerList = (profileId: string) =>
  invoke<PlayerInfo[]>("get_player_list", { profileId });

export const getBans = (profileId: string) =>
  invoke<BanInfo[]>("get_bans", { profileId });

export const unbanPlayer = (profileId: string, steamId: string) =>
  invoke<string>("unban_player", { profileId, steamId });

// ---------- Installed plugins ----------

export const getInstalledPlugins = (profileId: string) =>
  invoke<InstalledPlugin[]>("get_installed_plugins", { profileId });

export const enablePlugin = (profileId: string, pluginName: string) =>
  invoke<void>("enable_plugin", { profileId, pluginName });

export const disablePlugin = (profileId: string, pluginName: string) =>
  invoke<void>("disable_plugin", { profileId, pluginName });

export const reloadPlugin = (profileId: string, pluginName: string) =>
  invoke<string>("reload_plugin", { profileId, pluginName });

export const uninstallPlugin = (
  profileId: string,
  pluginName: string,
  deleteConfig: boolean,
) =>
  invoke<string[]>("uninstall_plugin", { profileId, pluginName, deleteConfig });

export const installLocalPlugin = (profileId: string, sourcePath: string) =>
  invoke<InstalledPlugin>("install_local_plugin", { profileId, sourcePath });

// ---------- Plugin configs ----------

export const loadPluginConfig = (
  profileId: string,
  pluginName: string,
  configKind: ConfigKind,
) => invoke<string>("load_plugin_config", { profileId, pluginName, configKind });

export const savePluginConfig = (
  profileId: string,
  pluginName: string,
  configKind: ConfigKind,
  content: string,
) =>
  invoke<void>("save_plugin_config", {
    profileId,
    pluginName,
    configKind,
    content,
  });

export const listConfigBackups = (profileId: string, pluginName: string) =>
  invoke<ConfigBackup[]>("list_config_backups", { profileId, pluginName });

export const readConfigBackup = (
  profileId: string,
  pluginName: string,
  fileName: string,
) => invoke<string>("read_config_backup", { profileId, pluginName, fileName });

export const restoreConfigBackup = (
  profileId: string,
  pluginName: string,
  fileName: string,
) => invoke<void>("restore_config_backup", { profileId, pluginName, fileName });

// ---------- Plugin store ----------

export const fetchUmodPlugins = (page: number, search?: string) =>
  invoke<PluginStorePage>("fetch_umod_plugins", { page, search });

export const listCachedUmodPlugins = () =>
  invoke<PluginMetaData[]>("list_cached_umod_plugins");

export const installPlugin = (profileId: string, pluginSlug: string) =>
  invoke<InstalledPlugin>("install_plugin", { profileId, pluginSlug });

// ---------- Updates / deps ----------

export const checkForPluginUpdates = (profileId: string) =>
  invoke<PluginUpdateInfo[]>("check_for_plugin_updates", { profileId });

export const updateAllPlugins = (profileId: string) =>
  invoke<BulkUpdateResult>("update_all_plugins", { profileId });

export const checkCommonDependencies = (profileId: string) =>
  invoke<DependencyStatus>("check_common_dependencies", { profileId });

// ---------- Wipe schedule ----------

export const getWipeSchedule = (profileId: string) =>
  invoke<WipeSchedule | null>("get_wipe_schedule", { profileId });

export const setWipeSchedule = (
  profileId: string,
  cadenceDays: number,
  lastWipeAt: string | null,
  notes: string | null,
) =>
  invoke<WipeSchedule>("set_wipe_schedule", {
    profileId,
    cadenceDays,
    lastWipeAt,
    notes,
  });

export const markWipedNow = (profileId: string) =>
  invoke<WipeSchedule>("mark_wiped_now", { profileId });

export const deleteWipeSchedule = (profileId: string) =>
  invoke<void>("delete_wipe_schedule", { profileId });

// ---------- Activity log ----------

export const listActivity = (limit?: number) =>
  invoke<ActivityEntry[]>("list_activity", { limit });

export const clearActivity = () => invoke<void>("clear_activity");

// ---------- Saved RCON commands ----------

export const listSavedCommands = (profileId: string) =>
  invoke<SavedCommand[]>("list_saved_commands", { profileId });

export const addSavedCommand = (profileId: string, label: string, command: string) =>
  invoke<SavedCommand>("add_saved_command", { profileId, label, command });

export const deleteSavedCommand = (id: number) =>
  invoke<void>("delete_saved_command", { id });

// ---------- Profile import / export ----------

export const exportProfilesToPath = (path: string) =>
  invoke<number>("export_profiles_to_path", { path });

export const importProfilesFromPath = (path: string) =>
  invoke<number>("import_profiles_from_path", { path });

// ---------- Install (one-click local server) ----------

export const installRustServer = (args: InstallArgs) =>
  invoke<ServerProfile>("install_rust_server", { args });

/** Subscribe to install progress events. Returns an unlisten function. */
export const onInstallProgress = (cb: (p: InstallProgress) => void): Promise<UnlistenFn> =>
  listen<InstallProgress>("install-progress", (e) => cb(e.payload));

// ---------- Launch settings (per-profile start.bat parameters) ----------

export const getLaunchSettings = (profileId: string) =>
  invoke<LaunchSettings>("get_launch_settings", { profileId });

export const saveLaunchSettings = (settings: LaunchSettings) =>
  invoke<LaunchSettings>("save_launch_settings", { settings });

export const regenerateStartBat = (profileId: string) =>
  invoke<void>("regenerate_start_bat", { profileId });

export const deleteLaunchSettings = (profileId: string) =>
  invoke<void>("delete_launch_settings", { profileId });

// ---------- Local server process lifecycle ----------

export const startServer = (profileId: string) =>
  invoke<void>("start_server", { profileId });

export const stopServer = (profileId: string) =>
  invoke<void>("stop_server", { profileId });

export const getRunningServers = () =>
  invoke<string[]>("get_running_servers");

export const onServerState = (cb: (e: ServerStateEvent) => void): Promise<UnlistenFn> =>
  listen<ServerStateEvent>("server-state", (e) => cb(e.payload));

export const onServerLog = (cb: (e: ServerLogEvent) => void): Promise<UnlistenFn> =>
  listen<ServerLogEvent>("server-log", (e) => cb(e.payload));

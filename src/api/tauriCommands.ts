// Thin wrappers around `invoke()` so call sites get type-checked arguments
// and typed return values. The command names match the snake_case names
// registered in `src-tauri/src/lib.rs`.

import { invoke } from "@tauri-apps/api/core";
import type {
  ActivityEntry,
  BulkUpdateResult,
  ConfigBackup,
  ConfigKind,
  DependencyStatus,
  InstalledPlugin,
  PlayerInfo,
  PluginMetaData,
  PluginStorePage,
  PluginUpdateInfo,
  RconCommandResult,
  RconTestResult,
  ServerProfile,
  ServerProfileInput,
  ServerStatus,
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

// ---------- Activity log ----------

export const listActivity = (limit?: number) =>
  invoke<ActivityEntry[]>("list_activity", { limit });

export const clearActivity = () => invoke<void>("clear_activity");

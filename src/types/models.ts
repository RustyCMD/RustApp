// Mirrors of the Rust models in `src-tauri/src/models.rs`. These are the
// JSON-shaped wire types that travel through `invoke()`. Keep them in sync.

export interface ServerProfile {
  id: string;
  name: string;
  ipAddress: string;
  rconPort: number;
  rconPassword: string;
  serverDirectory: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerProfileInput {
  name: string;
  ipAddress: string;
  rconPort: number;
  rconPassword: string;
  serverDirectory: string;
  notes?: string | null;
}

export interface SavedCommand {
  id: number;
  profileId: string;
  label: string;
  command: string;
  createdAt: string;
}

export interface PluginMetaData {
  slug: string;
  name: string;
  author: string | null;
  version: string | null;
  description: string | null;
  downloadUrl: string | null;
  pageUrl: string | null;
  lastUpdated: string | null;
}

export interface InstalledPlugin {
  name: string;
  author: string | null;
  version: string | null;
  description: string | null;
  filePath: string;
  enabled: boolean;
  hasConfig: boolean;
}

export interface PluginUpdateInfo {
  pluginName: string;
  installedVersion: string | null;
  latestVersion: string | null;
  downloadUrl: string | null;
}

export interface DependencyStatus {
  managedDir: string;
  present: string[];
  missing: string[];
}

export interface RconTestResult {
  ok: boolean;
  serverResponse: string | null;
  elapsedMs: number;
}

export interface PluginStorePage {
  items: PluginMetaData[];
  page: number;
  hasNext: boolean;
}

export type ConfigKind = "json" | "ini";

export interface ConfigBackup {
  fileName: string;
  path: string;
  sizeBytes: number;
  modified: string | null;
}

export interface PlayerInfo {
  steamId: string;
  name: string;
  ping: number | null;
  connectedSeconds: number | null;
  address: string | null;
}

export interface ServerStatus {
  hostname: string | null;
  map: string | null;
  players: number | null;
  maxPlayers: number | null;
  queued: number | null;
  joining: number | null;
  uptimeSeconds: number | null;
  framerate: number | null;
  raw: string;
}

export interface RconCommandResult {
  command: string;
  response: string;
  elapsedMs: number;
}

export interface BulkUpdateFailure {
  pluginName: string;
  error: string;
}

export interface BulkUpdateResult {
  updated: string[];
  failed: BulkUpdateFailure[];
}

export type ActivityStatus = "ok" | "error" | "info";

export interface ActivityEntry {
  id: number;
  timestamp: string;
  profileId: string | null;
  action: string;
  target: string | null;
  status: ActivityStatus;
  message: string | null;
}

/// Wire shape returned from a failing `invoke()` call. Always paired with
/// {@link formatError} on the frontend so users see a code + message.
export interface AppErrorWire {
  code: string;     // e.g. "RCON-001"
  category: string; // e.g. "RCON"
  message: string;
}

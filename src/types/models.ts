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

export interface BanInfo {
  steamId: string;
  name: string;
  reason: string | null;
  /** ISO timestamp; null = permanent ban. */
  expiresAt: string | null;
}

export interface WipeSchedule {
  profileId: string;
  cadenceDays: number;
  lastWipeAt: string | null;
  nextWipeAt: string | null;
  notes: string | null;
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
  permissions: string[];
  chatCommands: string[];
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

// ───────────────────── Install (one-click local server) ─────────────────────

export type InstallStage =
  | "prepare"
  | "download_steamcmd"
  | "extract_steamcmd"
  | "run_steamcmd"
  | "verify"
  | "oxide_download"
  | "oxide_extract"
  | "oxide_dirs"
  | "register_profile";

export interface InstallArgs {
  name: string;
  installDir: string;
  installOxide: boolean;
}

export type InstallProgress =
  | { kind: "stage"; stage: InstallStage; message: string }
  | { kind: "log"; line: string; stream: "stdout" | "stderr" }
  | { kind: "done"; profileId: string }
  | { kind: "error"; stage: InstallStage; message: string }
  | { kind: "warning"; stage: InstallStage; message: string };

// ───────────────────── Launch settings (start.bat params) ───────────────────

export interface LaunchSettings {
  profileId: string;
  identity: string;
  hostname: string;
  description: string;
  url: string;
  headerImage: string;
  serverIp: string;
  serverPort: number;
  queryPort: number;
  appPort: number;
  maxPlayers: number;
  worldsize: number;
  seed: number;
  /** Map preset — `Procedural Map`, `Barren`, `HapisIsland`, `SavasIsland_koth`, etc. */
  level: string;
  saveInterval: number;
  tickrate: number;
  globalChat: boolean;
  salt: number;
  /** Free-form extra args appended to RustDedicated.exe's command line. */
  extraArgs: string;
}

// ───────────────────── Local server process events ──────────────────────────

export type ServerLifecycleState = "starting" | "running" | "stopped" | "exited";

export interface ServerStateEvent {
  profileId: string;
  state: ServerLifecycleState;
  /** Set on `exited`. */
  code: number | null;
  /** Set on `running`. */
  pid: number | null;
}

export interface ServerLogEvent {
  profileId: string;
  line: string;
  stream: "stdout" | "stderr";
}

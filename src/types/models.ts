// Mirrors of the Rust models in `src-tauri/src/models.rs`. These are the
// JSON-shaped wire types that travel through `invoke()`. Keep them in sync.

export interface ServerProfile {
  id: string;
  name: string;
  ipAddress: string;
  rconPort: number;
  rconPassword: string;
  serverDirectory: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServerProfileInput {
  name: string;
  ipAddress: string;
  rconPort: number;
  rconPassword: string;
  serverDirectory: string;
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

import { useState } from "react";
import {
  disablePlugin,
  enablePlugin,
  reloadPlugin,
} from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import type { InstalledPlugin } from "@/types/models";

interface Props {
  profileId: string;
  plugin: InstalledPlugin;
  hasUpdate?: boolean;
  onChanged: () => void;
  onConfigure: (plugin: InstalledPlugin) => void;
}

export default function InstalledPluginRow({
  profileId,
  plugin,
  hasUpdate,
  onChanged,
  onConfigure,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(true);
    try {
      await fn();
      toast.push(`${label}: ${plugin.name}`, "ok");
      onChanged();
    } catch (e) {
      toast.push(`${label} failed: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <strong>{plugin.name}</strong>
        {hasUpdate && <span className="pill warn" style={{ marginLeft: 8 }}>update</span>}
        {plugin.description && (
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {plugin.description}
          </div>
        )}
      </td>
      <td>{plugin.author ?? "—"}</td>
      <td>{plugin.version ?? "—"}</td>
      <td>
        {plugin.enabled ? (
          <span className="pill on">enabled</span>
        ) : (
          <span className="pill off">disabled</span>
        )}
      </td>
      <td className="row" style={{ justifyContent: "flex-end" }}>
        {plugin.enabled ? (
          <button
            disabled={busy}
            onClick={() =>
              run("Disabled", () => disablePlugin(profileId, plugin.name))
            }
          >
            Disable
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() =>
              run("Enabled", () => enablePlugin(profileId, plugin.name))
            }
          >
            Enable
          </button>
        )}
        <button
          disabled={busy || !plugin.enabled}
          onClick={() =>
            run("Reloaded", () => reloadPlugin(profileId, plugin.name))
          }
        >
          Reload
        </button>
        <button onClick={() => onConfigure(plugin)} disabled={!plugin.hasConfig}>
          Configure
        </button>
      </td>
    </tr>
  );
}

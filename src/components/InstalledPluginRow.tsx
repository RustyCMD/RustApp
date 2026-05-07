import { useState } from "react";
import { CheckSquare, Info, Power, RefreshCw, Settings, Square, Trash2 } from "lucide-react";
import {
  disablePlugin,
  enablePlugin,
  reloadPlugin,
  uninstallPlugin,
} from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import { formatError } from "@/lib/errors";
import type { InstalledPlugin } from "@/types/models";

interface Props {
  profileId: string;
  plugin: InstalledPlugin;
  hasUpdate?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onChanged: () => void;
  onConfigure: (plugin: InstalledPlugin) => void;
  onInspect?: (plugin: InstalledPlugin) => void;
}

export default function InstalledPluginRow({
  profileId,
  plugin,
  hasUpdate,
  selected = false,
  onToggleSelected,
  onChanged,
  onConfigure,
  onInspect,
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
      toast.push(`${label} failed: ${formatError(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onUninstall() {
    const deleteCfg = confirm(
      `Uninstall "${plugin.name}"?\n\nClick OK to also delete its config file(s); Cancel to keep configs.`,
    );
    // Cancel here means user said "keep configs" — they only get out by closing the dialog at the OS level,
    // so we always proceed with the uninstall and use the choice for `deleteConfig`.
    setBusy(true);
    try {
      await uninstallPlugin(profileId, plugin.name, deleteCfg);
      toast.push(`Uninstalled ${plugin.name}`, "ok");
      onChanged();
    } catch (e) {
      toast.push(`Uninstall failed: ${formatError(e)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr style={selected ? { background: "var(--accent-soft)" } : undefined}>
      {onToggleSelected && (
        <td style={{ width: 36 }}>
          <button
            className="ghost icon"
            onClick={onToggleSelected}
            style={{ padding: 4 }}
            aria-label={selected ? "Deselect" : "Select"}
          >
            {selected ? (
              <CheckSquare size={16} color="var(--accent)" />
            ) : (
              <Square size={16} />
            )}
          </button>
        </td>
      )}
      <td>
        <div className="stack" style={{ gap: 2 }}>
          <div className="row" style={{ gap: 8 }}>
            <strong>{plugin.name}</strong>
            {hasUpdate && <span className="pill warn">update</span>}
          </div>
          {plugin.description && (
            <div className="muted small" style={{ marginTop: 2 }}>
              {plugin.description}
            </div>
          )}
        </div>
      </td>
      <td className="muted">{plugin.author ?? "—"}</td>
      <td className="mono small">{plugin.version ?? "—"}</td>
      <td>
        {plugin.enabled ? (
          <span className="pill on">enabled</span>
        ) : (
          <span className="pill off">disabled</span>
        )}
      </td>
      <td className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
        {plugin.enabled ? (
          <button
            disabled={busy}
            className="ghost icon"
            title="Disable"
            onClick={() => run("Disabled", () => disablePlugin(profileId, plugin.name))}
          >
            <Power size={15} />
          </button>
        ) : (
          <button
            disabled={busy}
            className="ghost icon"
            title="Enable"
            onClick={() => run("Enabled", () => enablePlugin(profileId, plugin.name))}
          >
            <Power size={15} color="var(--ok)" />
          </button>
        )}
        <button
          disabled={busy || !plugin.enabled}
          className="ghost icon"
          title="Reload"
          onClick={() => run("Reloaded", () => reloadPlugin(profileId, plugin.name))}
        >
          <RefreshCw size={15} />
        </button>
        {onInspect && (
          <button
            className="ghost icon"
            title="Plugin details (permissions, commands)"
            onClick={() => onInspect(plugin)}
          >
            <Info size={15} />
          </button>
        )}
        <button
          className="ghost icon"
          title={plugin.hasConfig ? "Configure" : "No config file"}
          disabled={!plugin.hasConfig}
          onClick={() => onConfigure(plugin)}
        >
          <Settings size={15} />
        </button>
        <button
          disabled={busy}
          className="ghost icon"
          title="Uninstall"
          onClick={onUninstall}
        >
          <Trash2 size={15} color="var(--bad)" />
        </button>
      </td>
    </tr>
  );
}

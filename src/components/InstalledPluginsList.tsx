import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CheckSquare,
  Power,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  checkForPluginUpdates,
  disablePlugin,
  enablePlugin,
  getInstalledPlugins,
  installLocalPlugin,
  reloadPlugin,
  uninstallPlugin,
  updateAllPlugins,
} from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import InstalledPluginRow from "@/components/InstalledPluginRow";
import ConfigFileEditor from "@/components/ConfigFileEditor";
import PluginInfoModal from "@/components/PluginInfoModal";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import { useUpdateStore } from "@/state/updateStore";
import type { InstalledPlugin } from "@/types/models";
import { formatError } from "@/lib/errors";

type Filter = "all" | "enabled" | "disabled" | "updates";

export default function InstalledPluginsList({
  profileId,
}: {
  profileId: string;
}) {
  const toast = useToast();
  // IMPORTANT: subscribe via a selector. `useUpdateStore()` (no selector)
  // returns the whole state object, whose reference changes on every
  // `set()` inside the store — which then changes the identity of any
  // useCallback/useEffect that depends on it, triggering an infinite
  // render loop the moment we call refresh() inside one of them.
  const refreshGlobalUpdates = useUpdateStore((s) => s.refresh);

  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InstalledPlugin | null>(null);
  const [inspecting, setInspecting] = useState<InstalledPlugin | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function pickAndInstallLocal() {
    try {
      const picked = await openDialog({
        title: "Install a local plugin (.cs file)",
        multiple: false,
        filters: [{ name: "C# source", extensions: ["cs"] }],
      });
      if (typeof picked !== "string") return;
      const installed = await installLocalPlugin(profileId, picked);
      toast.push(`Installed ${installed.name}`, "ok");
      reload();
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  const reload = useCallback(async () => {
    setPlugins(null);
    try {
      const list = await getInstalledPlugins(profileId);
      setPlugins(list);
    } catch (e) {
      toast.push(formatError(e), "error");
      setPlugins([]);
    }
  }, [profileId, toast]);

  const refreshUpdates = useCallback(async () => {
    try {
      const ups = await checkForPluginUpdates(profileId);
      setUpdates(new Set(ups.map((u) => u.pluginName)));
      refreshGlobalUpdates(profileId);
    } catch {
      // best-effort
    }
  }, [profileId, refreshGlobalUpdates]);

  useEffect(() => {
    reload();
    refreshUpdates();
  }, [reload, refreshUpdates]);

  // Drop selections that no longer correspond to a visible plugin (e.g. after a refresh).
  useEffect(() => {
    if (!plugins) return;
    setSelected((prev) => {
      const valid = new Set(plugins.map((p) => p.name));
      const next = new Set<string>();
      prev.forEach((n) => valid.has(n) && next.add(n));
      return next.size === prev.size ? prev : next;
    });
  }, [plugins]);

  const filtered = useMemo(() => {
    if (!plugins) return null;
    const q = search.trim().toLowerCase();
    return plugins.filter((p) => {
      if (filter === "enabled" && !p.enabled) return false;
      if (filter === "disabled" && p.enabled) return false;
      if (filter === "updates" && !updates.has(p.name)) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.author?.toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [plugins, search, filter, updates]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAllVisible() {
    if (!filtered) return;
    setSelected((prev) => {
      const visibleNames = filtered.map((p) => p.name);
      const allSelected = visibleNames.every((n) => prev.has(n));
      const next = new Set(prev);
      if (allSelected) visibleNames.forEach((n) => next.delete(n));
      else visibleNames.forEach((n) => next.add(n));
      return next;
    });
  }

  /** Run `op` on every selected plugin sequentially. Collected failures are
      surfaced in one toast, not one per row. */
  async function bulk(label: string, op: (name: string) => Promise<unknown>) {
    if (selected.size === 0) return;
    setBulkRunning(true);
    let ok = 0;
    const failures: Array<[string, string]> = [];
    for (const name of Array.from(selected)) {
      try {
        await op(name);
        ok++;
      } catch (e) {
        failures.push([name, formatError(e)]);
      }
    }
    setBulkRunning(false);
    if (failures.length === 0) {
      toast.push(`${label} ${ok} plugin${ok === 1 ? "" : "s"}`, "ok");
    } else {
      toast.push(
        `${label} ${ok} ok, ${failures.length} failed: ${failures
          .map(([n]) => n)
          .join(", ")}`,
        ok > 0 ? "info" : "error",
      );
    }
    setSelected(new Set());
    reload();
    refreshUpdates();
  }

  async function bulkUninstall() {
    const n = selected.size;
    const choice = window.confirm(
      `Uninstall ${n} plugin${n === 1 ? "" : "s"}?\n\nOK = also delete config files\nCancel = keep configs (the uninstall still proceeds)`,
    );
    bulk("Uninstalled", (name) => uninstallPlugin(profileId, name, choice));
  }

  async function onUpdateAll() {
    if (updates.size === 0) {
      toast.push("Nothing to update.", "info");
      return;
    }
    setBulkRunning(true);
    try {
      const r = await updateAllPlugins(profileId);
      const okMsg = r.updated.length
        ? `Updated ${r.updated.length} plugin${r.updated.length === 1 ? "" : "s"}`
        : null;
      const errMsg = r.failed.length ? `${r.failed.length} failed` : null;
      toast.push(
        [okMsg, errMsg].filter(Boolean).join(" · ") || "No changes",
        r.failed.length ? "info" : "ok",
      );
      reload();
      refreshUpdates();
    } catch (e) {
      toast.push(formatError(e), "error");
    } finally {
      setBulkRunning(false);
    }
  }

  const stats = useMemo(() => {
    if (!plugins) return null;
    return {
      total: plugins.length,
      enabled: plugins.filter((p) => p.enabled).length,
      disabled: plugins.filter((p) => !p.enabled).length,
      updates: updates.size,
    };
  }, [plugins, updates]);

  const allVisibleSelected =
    !!filtered && filtered.length > 0 && filtered.every((p) => selected.has(p.name));
  const someVisibleSelected =
    !!filtered && filtered.some((p) => selected.has(p.name));

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div className="searchbar" style={{ minWidth: 280, flex: 1 }}>
          <Search size={16} />
          <input
            placeholder="Search by name or author…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <FilterChip current={filter} value="all" set={setFilter}>
            All {stats && `(${stats.total})`}
          </FilterChip>
          <FilterChip current={filter} value="enabled" set={setFilter}>
            Enabled {stats && `(${stats.enabled})`}
          </FilterChip>
          <FilterChip current={filter} value="disabled" set={setFilter}>
            Disabled {stats && `(${stats.disabled})`}
          </FilterChip>
          <FilterChip current={filter} value="updates" set={setFilter}>
            Updates {stats && `(${stats.updates})`}
          </FilterChip>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button onClick={reload} title="Refresh" className="ghost icon">
            <RefreshCw size={16} />
          </button>
          <button onClick={pickAndInstallLocal} title="Install a local .cs file">
            <Upload size={14} />
            Install local…
          </button>
          <button
            className="primary"
            onClick={onUpdateAll}
            disabled={bulkRunning || updates.size === 0}
            title={updates.size === 0 ? "Nothing to update" : ""}
          >
            <Sparkles size={14} />
            {bulkRunning
              ? "Updating…"
              : updates.size === 0
                ? "Up to date"
                : `Update all (${updates.size})`}
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            marginBottom: 12,
            borderColor: "var(--accent-strong)",
          }}
        >
          <strong>{selected.size}</strong>
          <span className="muted small">selected</span>
          <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
            <button
              disabled={bulkRunning}
              onClick={() => bulk("Enabled", (n) => enablePlugin(profileId, n))}
            >
              <Power size={14} color="var(--ok)" /> Enable
            </button>
            <button
              disabled={bulkRunning}
              onClick={() => bulk("Disabled", (n) => disablePlugin(profileId, n))}
            >
              <Power size={14} /> Disable
            </button>
            <button
              disabled={bulkRunning}
              onClick={() => bulk("Reloaded", (n) => reloadPlugin(profileId, n))}
            >
              <RefreshCw size={14} /> Reload
            </button>
            <button disabled={bulkRunning} className="danger" onClick={bulkUninstall}>
              <Trash2 size={14} /> Uninstall
            </button>
            <button className="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {plugins === null ? (
        <div className="card stack">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      ) : plugins.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Boxes}
            title="No plugins installed"
            description={
              <>
                Drop <span className="mono">.cs</span> files into{" "}
                <span className="mono">oxide/plugins/</span> on your server, or
                browse the <a href="#/store">Plugin Store</a>.
              </>
            }
          />
        </div>
      ) : filtered && filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try a different search term or filter."
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <button
                    className="ghost icon"
                    title={allVisibleSelected ? "Clear selection" : "Select all visible"}
                    onClick={toggleAllVisible}
                    style={{ padding: 4 }}
                  >
                    {allVisibleSelected ? (
                      <CheckSquare size={16} color="var(--accent)" />
                    ) : someVisibleSelected ? (
                      <CheckSquare size={16} color="var(--text-muted)" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th>Plugin</th>
                <th>Author</th>
                <th>Version</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered!.map((p) => (
                <InstalledPluginRow
                  key={p.filePath}
                  profileId={profileId}
                  plugin={p}
                  hasUpdate={updates.has(p.name)}
                  selected={selected.has(p.name)}
                  onToggleSelected={() => toggle(p.name)}
                  onChanged={() => {
                    reload();
                    refreshUpdates();
                  }}
                  onConfigure={setEditing}
                  onInspect={setInspecting}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ConfigFileEditor
          profileId={profileId}
          plugin={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {inspecting && (
        <PluginInfoModal
          plugin={inspecting}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  );
}

function FilterChip({
  current,
  value,
  set,
  children,
}: {
  current: Filter;
  value: Filter;
  set: (v: Filter) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => set(value)}
      className={active ? "primary" : "ghost"}
      style={{ borderRadius: 999, padding: "6px 12px" }}
    >
      {children}
    </button>
  );
}

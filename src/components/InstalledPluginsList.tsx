import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, RefreshCw, Search, Sparkles } from "lucide-react";
import {
  checkForPluginUpdates,
  getInstalledPlugins,
  updateAllPlugins,
} from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import InstalledPluginRow from "@/components/InstalledPluginRow";
import ConfigFileEditor from "@/components/ConfigFileEditor";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import { useUpdateStore } from "@/state/updateStore";
import type { InstalledPlugin } from "@/types/models";

type Filter = "all" | "enabled" | "disabled" | "updates";

export default function InstalledPluginsList({
  profileId,
}: {
  profileId: string;
}) {
  const toast = useToast();
  const updateStore = useUpdateStore();

  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InstalledPlugin | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const reload = useCallback(async () => {
    setPlugins(null);
    try {
      const list = await getInstalledPlugins(profileId);
      setPlugins(list);
    } catch (e) {
      toast.push(String(e), "error");
      setPlugins([]);
    }
  }, [profileId, toast]);

  const refreshUpdates = useCallback(async () => {
    try {
      const ups = await checkForPluginUpdates(profileId);
      setUpdates(new Set(ups.map((u) => u.pluginName)));
      // Mirror into the global store so the sidebar badge stays correct.
      updateStore.refresh(profileId);
    } catch {
      // best-effort
    }
  }, [profileId, updateStore]);

  useEffect(() => {
    reload();
    refreshUpdates();
  }, [reload, refreshUpdates]);

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
      toast.push(String(e), "error");
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
                  onChanged={() => {
                    reload();
                    refreshUpdates();
                  }}
                  onConfigure={setEditing}
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

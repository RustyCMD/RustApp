import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkForPluginUpdates,
  getInstalledPlugins,
} from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import InstalledPluginRow from "@/components/InstalledPluginRow";
import ConfigFileEditor from "@/components/ConfigFileEditor";
import type { InstalledPlugin } from "@/types/models";

export default function InstalledPluginsList({
  profileId,
}: {
  profileId: string;
}) {
  const toast = useToast();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<InstalledPlugin | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getInstalledPlugins(profileId);
      setPlugins(list);
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [profileId, toast]);

  const refreshUpdates = useCallback(async () => {
    try {
      const ups = await checkForPluginUpdates(profileId);
      setUpdates(new Set(ups.map((u) => u.pluginName)));
    } catch (e) {
      // Surfacing this as an error would be noisy on every dashboard render.
      console.warn("update check failed:", e);
    }
  }, [profileId]);

  useEffect(() => {
    reload();
    refreshUpdates();
  }, [reload, refreshUpdates]);

  const enabledCount = useMemo(
    () => plugins.filter((p) => p.enabled).length,
    [plugins],
  );

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="muted">
          {loading
            ? "Loading…"
            : `${plugins.length} plugins (${enabledCount} enabled)`}
          {updates.size > 0 && (
            <span className="pill warn" style={{ marginLeft: 8 }}>
              {updates.size} update{updates.size === 1 ? "" : "s"} available
            </span>
          )}
        </div>
        <button onClick={reload}>Refresh</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Author</th>
            <th>Version</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {plugins.map((p) => (
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

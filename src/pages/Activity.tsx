import { useCallback, useEffect, useMemo, useState } from "react";
import { History, RefreshCw, Trash2 } from "lucide-react";
import { clearActivity, listActivity } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import type { ActivityEntry } from "@/types/models";

export default function ActivityPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [filter, setFilter] = useState<"all" | "ok" | "error" | "info">("all");

  const reload = useCallback(async () => {
    setEntries(null);
    try {
      setEntries(await listActivity(500));
    } catch (e) {
      toast.push(String(e), "error");
      setEntries([]);
    }
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onClear() {
    if (!confirm("Clear all activity entries?")) return;
    try {
      await clearActivity();
      setEntries([]);
      toast.push("Activity log cleared", "ok");
    } catch (e) {
      toast.push(String(e), "error");
    }
  }

  const visible = useMemo(() => {
    if (!entries) return null;
    return filter === "all" ? entries : entries.filter((e) => e.status === filter);
  }, [entries, filter]);

  return (
    <>
      <div className="page-header">
        <h2>Activity Log</h2>
        <div className="actions">
          <button className="ghost icon" onClick={reload} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button className="danger" onClick={onClear} disabled={!entries?.length}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        {(["all", "ok", "error", "info"] as const).map((f) => (
          <button
            key={f}
            className={filter === f ? "primary" : "ghost"}
            style={{ borderRadius: 999, padding: "6px 12px" }}
            onClick={() => setFilter(f)}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {entries === null ? (
          <div style={{ padding: 16 }} className="stack">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={28} />)}
          </div>
        ) : visible!.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing here yet"
            description="Server actions you take in the app will be logged here."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Action</th>
                <th>Target</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {visible!.map((e) => (
                <tr key={e.id}>
                  <td className="mono small muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td>
                    <span
                      className={`pill ${e.status === "ok" ? "on" : e.status === "error" ? "bad" : "info"}`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="mono small">{e.action}</td>
                  <td>{e.target ?? <span className="faint">—</span>}</td>
                  <td className="muted small">{e.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

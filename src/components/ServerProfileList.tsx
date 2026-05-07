import { useState } from "react";
import { CheckCircle2, Pencil, Plug, Trash2 } from "lucide-react";
import { deleteServerProfile, testRconConnection } from "@/api/tauriCommands";
import { useServerStore } from "@/state/serverStore";
import { useToast } from "@/components/Toast";
import type { ServerProfile } from "@/types/models";

interface Props {
  onEdit: (profile: ServerProfile) => void;
}

export default function ServerProfileList({ onEdit }: Props) {
  const { profiles, selectedId, select, removeLocal } = useServerStore();
  const toast = useToast();
  const [testing, setTesting] = useState<string | null>(null);

  if (profiles.length === 0) {
    return <p className="muted">No server profiles yet — add one above.</p>;
  }

  async function onTest(p: ServerProfile) {
    setTesting(p.id);
    try {
      const r = await testRconConnection(p.id);
      toast.push(
        r.ok
          ? `Connected (${r.elapsedMs} ms)`
          : `Failed: ${r.serverResponse ?? "unknown"}`,
        r.ok ? "ok" : "error",
      );
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setTesting(null);
    }
  }

  async function onDelete(p: ServerProfile) {
    if (!confirm(`Delete profile "${p.name}"?`)) return;
    try {
      await deleteServerProfile(p.id);
      removeLocal(p.id);
      toast.push(`Deleted ${p.name}`, "ok");
    } catch (e) {
      toast.push(String(e), "error");
    }
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Address</th>
          <th>Path</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {profiles.map((p) => (
          <tr key={p.id}>
            <td>
              <div className="row" style={{ gap: 8 }}>
                <strong>{p.name}</strong>
                {p.id === selectedId && (
                  <span className="pill on">
                    <CheckCircle2 size={11} /> active
                  </span>
                )}
              </div>
            </td>
            <td>
              <code>
                {p.ipAddress}:{p.rconPort}
              </code>
            </td>
            <td className="muted small mono">{p.serverDirectory}</td>
            <td className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
              {p.id !== selectedId && (
                <button onClick={() => select(p.id)}>Activate</button>
              )}
              <button
                onClick={() => onTest(p)}
                disabled={testing === p.id}
                className="ghost icon"
                title="Test RCON"
              >
                <Plug size={15} />
              </button>
              <button
                onClick={() => onEdit(p)}
                className="ghost icon"
                title="Edit"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => onDelete(p)}
                className="ghost icon"
                title="Delete"
              >
                <Trash2 size={15} color="var(--bad)" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

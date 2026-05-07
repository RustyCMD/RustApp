import { useState } from "react";
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
          ? `Connected (${r.elapsedMs} ms): ${r.serverResponse ?? ""}`
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
              <strong>{p.name}</strong>{" "}
              {p.id === selectedId && <span className="pill on">active</span>}
            </td>
            <td>
              <code>
                {p.ipAddress}:{p.rconPort}
              </code>
            </td>
            <td className="muted">{p.serverDirectory}</td>
            <td className="row" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => select(p.id)} disabled={p.id === selectedId}>
                Activate
              </button>
              <button onClick={() => onTest(p)} disabled={testing === p.id}>
                {testing === p.id ? "Testing…" : "Test RCON"}
              </button>
              <button onClick={() => onEdit(p)}>Edit</button>
              <button onClick={() => onDelete(p)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

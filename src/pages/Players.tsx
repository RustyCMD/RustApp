import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { getPlayerList, sendRconCommand } from "@/api/tauriCommands";
import { useSelectedProfile } from "@/state/serverStore";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import type { PlayerInfo } from "@/types/models";
import { formatError } from "@/lib/errors";

const POLL_MS = 15_000;

export default function PlayersPage() {
  const profile = useSelectedProfile();
  const toast = useToast();
  const [players, setPlayers] = useState<PlayerInfo[] | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const list = await getPlayerList(profile.id);
      setPlayers(list);
    } catch (e) {
      toast.push(formatError(e), "error");
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, [profile, toast]);

  useEffect(() => {
    reload();
    if (!profile) return;
    const t = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(t);
  }, [profile, reload]);

  async function kick(p: PlayerInfo) {
    if (!profile) return;
    if (!confirm(`Kick ${p.name}?`)) return;
    try {
      await sendRconCommand(profile.id, `kick "${p.steamId}"`);
      toast.push(`Kicked ${p.name}`, "ok");
      reload();
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  async function ban(p: PlayerInfo) {
    if (!profile) return;
    const reason = prompt(`Ban ${p.name}? Optional reason:`, "");
    if (reason === null) return;
    try {
      await sendRconCommand(
        profile.id,
        `banid "${p.steamId}" "${p.name}" "${reason}"`,
      );
      toast.push(`Banned ${p.name}`, "ok");
      reload();
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  if (!profile) {
    return (
      <>
        <h2>Players</h2>
        <div className="card">
          <EmptyState
            icon={Users}
            title="Pick an active server"
            description="Switch a server on in the top bar to see who's online."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>
          Players
          {players && (
            <span className="muted small" style={{ marginLeft: 8, fontWeight: 400 }}>
              {players.length} online
            </span>
          )}
        </h2>
        <div className="actions">
          <button onClick={reload} className="ghost icon" title="Refresh">
            <RefreshCw size={16} className={loading ? "spinner" : undefined} />
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {players === null ? (
          <div style={{ padding: 16 }} className="stack">
            {[0, 1, 2].map((i) => <Skeleton key={i} height={32} />)}
          </div>
        ) : players.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No players online"
            description="The server is empty right now."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Steam ID</th>
                <th>Ping</th>
                <th>Connected</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.steamId}>
                  <td><strong>{p.name}</strong></td>
                  <td className="mono small">{p.steamId}</td>
                  <td className="mono small">{p.ping ?? "—"}</td>
                  <td className="mono small">{formatDuration(p.connectedSeconds)}</td>
                  <td className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                    <button onClick={() => kick(p)} className="ghost">Kick</button>
                    <button onClick={() => ban(p)} className="danger">Ban</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function formatDuration(secs: number | null): string {
  if (secs == null) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

import { useCallback, useEffect, useState } from "react";
import { Ban, RefreshCw, ShieldOff, Users } from "lucide-react";
import {
  getBans,
  getPlayerList,
  sendRconCommand,
  unbanPlayer,
} from "@/api/tauriCommands";
import { useSelectedProfile } from "@/state/serverStore";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import type { BanInfo, PlayerInfo } from "@/types/models";
import { formatError } from "@/lib/errors";

const POLL_MS = 15_000;
type Tab = "online" | "banned";

export default function PlayersPage() {
  const profile = useSelectedProfile();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("online");

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
        <h2>Players</h2>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <button
          className={tab === "online" ? "primary" : "ghost"}
          style={{ borderRadius: 999, padding: "6px 14px" }}
          onClick={() => setTab("online")}
        >
          <Users size={14} /> Online
        </button>
        <button
          className={tab === "banned" ? "primary" : "ghost"}
          style={{ borderRadius: 999, padding: "6px 14px" }}
          onClick={() => setTab("banned")}
        >
          <Ban size={14} /> Banned
        </button>
      </div>

      {tab === "online" ? (
        <OnlineTab profileId={profile.id} toast={toast} />
      ) : (
        <BannedTab profileId={profile.id} toast={toast} />
      )}
    </>
  );
}

function OnlineTab({
  profileId,
  toast,
}: {
  profileId: string;
  toast: ReturnType<typeof useToast>;
}) {
  const [players, setPlayers] = useState<PlayerInfo[] | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPlayers(await getPlayerList(profileId));
    } catch (e) {
      toast.push(formatError(e), "error");
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  }, [profileId, toast]);

  useEffect(() => {
    reload();
    const t = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(t);
  }, [reload]);

  async function kick(p: PlayerInfo) {
    if (!confirm(`Kick ${p.name}?`)) return;
    try {
      await sendRconCommand(profileId, `kick "${p.steamId}"`);
      toast.push(`Kicked ${p.name}`, "ok");
      reload();
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  async function ban(p: PlayerInfo) {
    const reason = prompt(`Ban ${p.name}? Optional reason:`, "");
    if (reason === null) return;
    try {
      await sendRconCommand(
        profileId,
        `banid "${p.steamId}" "${p.name}" "${reason}"`,
      );
      toast.push(`Banned ${p.name}`, "ok");
      reload();
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="muted small">
          {players != null && `${players.length} online`}
        </span>
        <button onClick={reload} className="ghost icon" title="Refresh">
          <RefreshCw size={16} className={loading ? "spinner" : undefined} />
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {players === null ? (
          <div style={{ padding: 16 }} className="stack">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={32} />
            ))}
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
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td className="mono small">{p.steamId}</td>
                  <td className="mono small">{p.ping ?? "—"}</td>
                  <td className="mono small">{formatDuration(p.connectedSeconds)}</td>
                  <td className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                    <button onClick={() => kick(p)} className="ghost">
                      Kick
                    </button>
                    <button onClick={() => ban(p)} className="danger">
                      Ban
                    </button>
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

function BannedTab({
  profileId,
  toast,
}: {
  profileId: string;
  toast: ReturnType<typeof useToast>;
}) {
  const [bans, setBans] = useState<BanInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setBans(await getBans(profileId));
    } catch (e) {
      toast.push(formatError(e), "error");
      setBans([]);
    } finally {
      setLoading(false);
    }
  }, [profileId, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function unban(b: BanInfo) {
    if (!confirm(`Unban ${b.name || b.steamId}?`)) return;
    try {
      await unbanPlayer(profileId, b.steamId);
      toast.push(`Unbanned ${b.name || b.steamId}`, "ok");
      reload();
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  const filtered = bans?.filter((b) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      b.steamId.includes(q) ||
      b.name.toLowerCase().includes(q) ||
      (b.reason?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <>
      <div className="row between" style={{ marginBottom: 12, gap: 12 }}>
        <input
          placeholder="Search bans by name, Steam ID, or reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <div className="row" style={{ gap: 8 }}>
          <span className="muted small">
            {bans != null && `${bans.length} banned`}
          </span>
          <button onClick={reload} className="ghost icon" title="Refresh">
            <RefreshCw size={16} className={loading ? "spinner" : undefined} />
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {bans === null ? (
          <div style={{ padding: 16 }} className="stack">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={32} />
            ))}
          </div>
        ) : bans.length === 0 ? (
          <EmptyState
            icon={ShieldOff}
            title="No bans"
            description="Nobody is banned on this server."
          />
        ) : filtered && filtered.length === 0 ? (
          <EmptyState
            icon={ShieldOff}
            title="No matches"
            description="Try a different search term."
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Steam ID</th>
                <th>Reason</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered!.map((b) => (
                <tr key={b.steamId}>
                  <td>
                    <strong>{b.name || <span className="faint">(unknown)</span>}</strong>
                  </td>
                  <td className="mono small">{b.steamId}</td>
                  <td className="muted small">{b.reason ?? "—"}</td>
                  <td className="mono small">
                    {b.expiresAt ? new Date(b.expiresAt).toLocaleString() : (
                      <span className="pill bad">permanent</span>
                    )}
                  </td>
                  <td className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                    <button onClick={() => unban(b)} className="ghost">
                      <ShieldOff size={13} /> Unban
                    </button>
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
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

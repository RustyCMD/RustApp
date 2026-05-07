import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Clock,
  Gauge,
  Map as MapIcon,
  Server as ServerIcon,
  Users,
} from "lucide-react";
import { useSelectedProfile, useServerStore } from "@/state/serverStore";
import {
  checkCommonDependencies,
  checkForPluginUpdates,
  getServerStatus,
} from "@/api/tauriCommands";
import type {
  DependencyStatus,
  PluginUpdateInfo,
  ServerStatus,
} from "@/types/models";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";

export default function Dashboard() {
  const profile = useSelectedProfile();
  const profiles = useServerStore((s) => s.profiles);

  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deps, setDeps] = useState<DependencyStatus | null>(null);
  const [updates, setUpdates] = useState<PluginUpdateInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    setLoading(true);
    setStatus(null);
    setStatusError(null);

    Promise.allSettled([
      getServerStatus(profile.id),
      checkCommonDependencies(profile.id),
      checkForPluginUpdates(profile.id),
    ]).then((results) => {
      if (!alive) return;
      const [s, d, u] = results;
      if (s.status === "fulfilled") setStatus(s.value);
      else setStatusError(String(s.reason));
      if (d.status === "fulfilled") setDeps(d.value);
      if (u.status === "fulfilled") setUpdates(u.value);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [profile]);

  if (profiles.length === 0) {
    return (
      <>
        <h2>Dashboard</h2>
        <div className="card">
          <EmptyState
            icon={ServerIcon}
            title="No server profiles yet"
            description="Add your first Rust server to start managing plugins."
            action={
              <Link to="/settings">
                <button className="primary">Open Settings</button>
              </Link>
            }
          />
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <h2>Dashboard</h2>
        <div className="card">
          <p className="muted">Pick a server in the top bar to see status.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{profile.name}</h2>
          <div className="muted small mono">
            {profile.ipAddress}:{profile.rconPort}
            <span className="faint"> · {profile.serverDirectory}</span>
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <StatTile
          icon={Users}
          label="Players online"
          value={
            loading
              ? <Skeleton width={60} height={24} />
              : status?.players != null
                ? `${status.players}${status.maxPlayers ? ` / ${status.maxPlayers}` : ""}`
                : "—"
          }
          meta={
            status?.queued != null && status.queued > 0
              ? `${status.queued} queued`
              : undefined
          }
        />
        <StatTile
          icon={MapIcon}
          label="Map"
          value={loading ? <Skeleton width={120} height={20} /> : status?.map ?? "—"}
        />
        <StatTile
          icon={Gauge}
          label="Framerate"
          value={loading ? <Skeleton width={80} height={20} /> : status?.framerate?.toFixed(1) ?? "—"}
          meta={status?.framerate ? "fps" : undefined}
        />
        <StatTile
          icon={Clock}
          label="Uptime"
          value={loading ? <Skeleton width={100} height={20} /> : formatUptime(status?.uptimeSeconds)}
        />
      </div>

      {statusError && (
        <div className="card" style={{ borderColor: "var(--bad-soft)" }}>
          <div className="row" style={{ gap: 10 }}>
            <CircleAlert size={18} color="var(--bad)" />
            <div>
              <strong>RCON unreachable</strong>
              <div className="muted small">{statusError}</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <h3>Updates</h3>
            <Link to="/installed" className="small">View all →</Link>
          </div>
          {loading ? (
            <Skeleton height={60} />
          ) : updates.length === 0 ? (
            <div className="row" style={{ gap: 10 }}>
              <CheckCircle2 size={18} color="var(--ok)" />
              <span>All plugins are up to date.</span>
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {updates.slice(0, 5).map((u) => (
                <li key={u.pluginName}>
                  <strong>{u.pluginName}</strong>{" "}
                  <span className="muted small">
                    {u.installedVersion} → {u.latestVersion}
                  </span>
                </li>
              ))}
              {updates.length > 5 && (
                <li className="muted small">
                  +{updates.length - 5} more
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Dependencies</h3>
          </div>
          {loading || !deps ? (
            <Skeleton height={60} />
          ) : deps.missing.length === 0 ? (
            <div className="row" style={{ gap: 10 }}>
              <CheckCircle2 size={18} color="var(--ok)" />
              <span>All required DLLs present.</span>
            </div>
          ) : (
            <>
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <CircleAlert size={18} color="var(--warn)" />
                <strong>{deps.missing.length} missing</strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {deps.missing.map((m) => (
                  <li key={m} className="mono small">{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Recent activity</h3>
          <Link to="/activity" className="small">Full log →</Link>
        </div>
        <RecentActivity />
      </div>
    </>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  meta,
}: {
  icon: typeof Activity;
  label: string;
  value: React.ReactNode;
  meta?: string;
}) {
  return (
    <div className="stat-tile">
      <div className="row" style={{ gap: 8, color: "var(--text-muted)" }}>
        <Icon size={14} />
        <span className="label">{label}</span>
      </div>
      <div className="value">{value}</div>
      {meta && <div className="meta">{meta}</div>}
    </div>
  );
}

function formatUptime(secs: number | null | undefined): string {
  if (secs == null) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

import { listActivity } from "@/api/tauriCommands";
import type { ActivityEntry } from "@/types/models";

function RecentActivity() {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    listActivity(8)
      .then((rows) => alive && setEntries(rows))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, []);
  if (entries === null) {
    return (
      <div className="stack">
        <Skeleton height={14} />
        <Skeleton height={14} />
        <Skeleton height={14} />
      </div>
    );
  }
  if (entries.length === 0) {
    return <p className="muted small" style={{ margin: 0 }}>Nothing yet — actions you take will show here.</p>;
  }
  return (
    <div className="stack">
      {entries.map((a) => (
        <div key={a.id} className="row" style={{ gap: 10 }}>
          <span
            className={`pill ${
              a.status === "ok" ? "on" : a.status === "error" ? "bad" : "info"
            }`}
          >
            {a.action}
          </span>
          <span>{a.target ?? a.message ?? ""}</span>
          <span className="faint small" style={{ marginLeft: "auto" }}>
            {new Date(a.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  CircleAlert,
  Clock,
  Server as ServerIcon,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  getServerStatus,
  testRconConnection,
} from "@/api/tauriCommands";
import { useServerStore } from "@/state/serverStore";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import type { ServerProfile, ServerStatus } from "@/types/models";

interface ProbeResult {
  ok: boolean;
  status: ServerStatus | null;
  error: string | null;
}

export default function ServersPage() {
  const navigate = useNavigate();
  const profiles = useServerStore((s) => s.profiles);
  const select = useServerStore((s) => s.select);
  const [probes, setProbes] = useState<Record<string, ProbeResult | undefined>>(
    {},
  );

  // Probe every profile in parallel. We don't await sequentially or the
  // first slow / down server would gate the rest.
  useEffect(() => {
    let alive = true;
    setProbes({});
    profiles.forEach((p) => {
      Promise.all([
        testRconConnection(p.id),
        getServerStatus(p.id).catch(() => null),
      ])
        .then(([test, status]) => {
          if (!alive) return;
          setProbes((prev) => ({
            ...prev,
            [p.id]: {
              ok: test.ok,
              status,
              error: test.ok ? null : test.serverResponse,
            },
          }));
        })
        .catch((err) => {
          if (!alive) return;
          setProbes((prev) => ({
            ...prev,
            [p.id]: { ok: false, status: null, error: String(err) },
          }));
        });
    });
    return () => {
      alive = false;
    };
  }, [profiles]);

  function open(p: ServerProfile) {
    select(p.id);
    navigate("/");
  }

  if (profiles.length === 0) {
    return (
      <>
        <h2>Servers</h2>
        <div className="card">
          <EmptyState
            icon={ServerIcon}
            title="No servers yet"
            description="Add your first server in Settings."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>
          Servers
          <span className="muted small" style={{ marginLeft: 8, fontWeight: 400 }}>
            {profiles.length} configured
          </span>
        </h2>
      </div>

      <div className="server-grid">
        {profiles.map((p) => (
          <ServerCard key={p.id} profile={p} probe={probes[p.id]} onOpen={() => open(p)} />
        ))}
      </div>
    </>
  );
}

function ServerCard({
  profile,
  probe,
  onOpen,
}: {
  profile: ServerProfile;
  probe: ProbeResult | undefined;
  onOpen: () => void;
}) {
  const loading = probe === undefined;
  const ok = probe?.ok === true;

  return (
    <button className="server-card" onClick={onOpen} type="button">
      <div className="row between" style={{ gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{profile.name}</strong>
        <StatusDot loading={loading} ok={ok} />
      </div>
      <div className="muted small mono" style={{ marginTop: 2 }}>
        {profile.ipAddress}:{profile.rconPort}
      </div>

      <div className="server-card-stats">
        {loading ? (
          <>
            <Skeleton height={16} />
            <Skeleton height={16} width="70%" />
            <Skeleton height={16} width="55%" />
          </>
        ) : ok && probe?.status ? (
          <>
            <CardStat
              icon={Users}
              text={
                probe.status.players != null
                  ? `${probe.status.players}${
                      probe.status.maxPlayers ? ` / ${probe.status.maxPlayers}` : ""
                    } players`
                  : "no player data"
              }
            />
            <CardStat
              icon={ServerIcon}
              text={probe.status.map ?? "unknown map"}
            />
            <CardStat
              icon={Clock}
              text={formatUptime(probe.status.uptimeSeconds)}
            />
          </>
        ) : (
          <CardStat
            icon={CircleAlert}
            text="Server offline"
            tone="bad"
            title={probe?.error ?? undefined}
          />
        )}
      </div>

      <div className="server-card-footer">
        <span className="muted small">Open</span>
        <ChevronRight size={14} />
      </div>
    </button>
  );
}

function StatusDot({ loading, ok }: { loading: boolean; ok: boolean }) {
  if (loading) return <span className="spinner" />;
  if (ok)
    return (
      <span className="pill on" title="RCON reachable">
        <Wifi size={11} /> online
      </span>
    );
  return (
    <span className="pill bad" title="RCON not reachable">
      <WifiOff size={11} /> offline
    </span>
  );
}

function CardStat({
  icon: Icon,
  text,
  tone,
  title,
}: {
  icon: typeof Wifi;
  text: string;
  tone?: "bad";
  title?: string;
}) {
  return (
    <div
      className="row"
      title={title}
      style={{
        gap: 8,
        color: tone === "bad" ? "var(--bad)" : "var(--text-muted)",
        fontSize: 13,
      }}
    >
      <Icon size={14} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {text}
      </span>
    </div>
  );
}

function formatUptime(secs: number | null | undefined): string {
  if (secs == null) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h uptime`;
  if (h > 0) return `${h}h ${m}m uptime`;
  return `${m}m uptime`;
}

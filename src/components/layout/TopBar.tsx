import { useEffect, useState } from "react";
import { Moon, Sun, Wifi, WifiOff, Server, RefreshCw } from "lucide-react";
import { useServerStore } from "@/state/serverStore";
import { useThemeStore, applyThemeToHtml } from "@/state/themeStore";
import { useUpdateStore } from "@/state/updateStore";
import { testRconConnection } from "@/api/tauriCommands";

type Status = "unknown" | "ok" | "bad" | "checking";

export default function TopBar() {
  const { profiles, selectedId, select } = useServerStore();
  const refreshUpdates = useUpdateStore((s) => s.refresh);
  const { theme, toggle } = useThemeStore();
  const [status, setStatus] = useState<Status>("unknown");

  useEffect(() => applyThemeToHtml(theme), [theme]);

  // Probe RCON whenever the active server changes.
  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setStatus("unknown");
      return;
    }
    setStatus("checking");
    testRconConnection(selectedId)
      .then((r) => alive && setStatus(r.ok ? "ok" : "bad"))
      .catch(() => alive && setStatus("bad"));
    refreshUpdates(selectedId);
    return () => {
      alive = false;
    };
  }, [selectedId, refreshUpdates]);

  return (
    <header className="topbar">
      <div className="server-picker">
        <Server size={14} />
        <select
          value={selectedId ?? ""}
          onChange={(e) => select(e.target.value || null)}
        >
          {profiles.length === 0 ? (
            <option value="">No servers configured</option>
          ) : (
            <>
              <option value="">— select —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </>
          )}
        </select>
        {selectedId && <ConnectionDot status={status} />}
      </div>

      <div className="spacer" />

      {selectedId && (
        <button
          className="ghost icon"
          title="Re-check RCON"
          onClick={() => {
            setStatus("checking");
            testRconConnection(selectedId).then(
              (r) => setStatus(r.ok ? "ok" : "bad"),
              () => setStatus("bad"),
            );
          }}
        >
          <RefreshCw size={16} />
        </button>
      )}

      <button
        className="ghost icon"
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        onClick={toggle}
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
}

function ConnectionDot({ status }: { status: Status }) {
  if (status === "checking") return <span className="spinner" />;
  if (status === "ok")
    return (
      <span title="RCON reachable">
        <Wifi size={14} color="var(--ok)" />
      </span>
    );
  if (status === "bad")
    return (
      <span title="RCON not reachable">
        <WifiOff size={14} color="var(--bad)" />
      </span>
    );
  return null;
}

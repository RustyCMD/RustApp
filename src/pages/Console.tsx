import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Send, Square, Terminal, Trash2 } from "lucide-react";
import { sendRconCommand, startServer, stopServer } from "@/api/tauriCommands";
import { useSelectedProfile } from "@/state/serverStore";
import { useProfileProcess, useServerProcessStore } from "@/state/serverProcessStore";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import SavedCommands from "@/components/SavedCommands";
import { formatError } from "@/lib/errors";
import type { ServerLifecycleState } from "@/types/models";

type Line =
  | { kind: "system"; text: string; ts: number }
  | { kind: "cmd"; text: string; ts: number }
  | { kind: "out"; text: string; ts: number }
  | { kind: "err"; text: string; ts: number };

const HISTORY_KEY = "rustapp:console-history";

function pillClass(state: ServerLifecycleState): string {
  switch (state) {
    case "running":
      return "pill on";
    case "starting":
      return "pill warn";
    case "exited":
      return "pill bad";
    case "stopped":
    default:
      return "pill off";
  }
}

function pillLabel(state: ServerLifecycleState): string {
  return {
    starting: "Starting",
    running: "Running",
    stopped: "Stopped",
    exited: "Exited",
  }[state];
}

export default function ConsolePage() {
  const profile = useSelectedProfile();
  const toast = useToast();

  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const [startStopBusy, setStartStopBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const proc = useProfileProcess(profile?.id);
  // Track which log entries we've already mirrored into the in-page `lines`,
  // so re-renders or new log events only append the *new* entries.
  const lastLogIdx = useRef(0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    if (!profile) return;
    setLines((l) => [
      ...l,
      {
        kind: "system",
        text: `Connected to ${profile.name} (${profile.ipAddress}:${profile.rconPort})`,
        ts: Date.now(),
      },
    ]);
    // Reset the log cursor for the newly selected profile so we replay its
    // existing buffer once.
    lastLogIdx.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Mirror new server-log events into the console view for the active profile.
  useEffect(() => {
    if (!profile) return;
    const total = proc.logs.length;
    if (total <= lastLogIdx.current) {
      // Buffer was cleared (e.g. clearLogs) — reset cursor.
      if (total < lastLogIdx.current) lastLogIdx.current = 0;
      return;
    }
    const fresh = proc.logs.slice(lastLogIdx.current).map<Line>((ev) => ({
      kind: ev.stream === "stderr" ? "err" : "out",
      text: ev.line,
      ts: Date.now(),
    }));
    lastLogIdx.current = total;
    setLines((l) => [...l, ...fresh]);
  }, [profile, proc.logs]);

  // Surface lifecycle transitions as system lines.
  useEffect(() => {
    if (!profile) return;
    const label = {
      starting: "Server starting…",
      running: `Server running (pid ${proc.pid ?? "?"})`,
      stopped: "Server stopped.",
      exited: `Server exited${proc.exitCode != null ? ` (code ${proc.exitCode})` : ""}.`,
    }[proc.state];
    setLines((l) => [...l, { kind: "system", text: label, ts: Date.now() }]);
    // We deliberately fire only on state transitions, not on pid/exitCode flips
    // independently — those arrive together with the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proc.state, profile?.id]);

  const startDisabled = useMemo(() => {
    if (!profile) return true;
    if (startStopBusy) return true;
    if (proc.state === "running" || proc.state === "starting") return true;
    if (!profile.serverDirectory.trim()) return true;
    return false;
  }, [profile, proc.state, startStopBusy]);

  const stopDisabled = useMemo(() => {
    if (!profile) return true;
    if (startStopBusy) return true;
    return proc.state !== "running" && proc.state !== "starting";
  }, [profile, proc.state, startStopBusy]);

  if (!profile) {
    return (
      <>
        <h2>RCON Console</h2>
        <div className="card">
          <EmptyState
            icon={Terminal}
            title="Pick an active server"
            description="Switch a server on in the top bar to start sending commands."
          />
        </div>
      </>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd || busy) return;
    setLines((l) => [...l, { kind: "cmd", text: cmd, ts: Date.now() }]);
    setInput("");
    setBusy(true);
    setHistoryIdx(null);
    const next = [cmd, ...history.filter((h) => h !== cmd)].slice(0, 50);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));

    try {
      const r = await sendRconCommand(profile!.id, cmd);
      setLines((l) => [
        ...l,
        { kind: "out", text: r.response || "(empty response)", ts: Date.now() },
      ]);
    } catch (err) {
      const msg = formatError(err);
      setLines((l) => [...l, { kind: "err", text: msg, ts: Date.now() }]);
      toast.push(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onStart() {
    if (!profile || startDisabled) return;
    setStartStopBusy(true);
    try {
      await startServer(profile.id);
    } catch (err) {
      toast.push(formatError(err), "error");
    } finally {
      setStartStopBusy(false);
    }
  }

  async function onStop() {
    if (!profile || stopDisabled) return;
    setStartStopBusy(true);
    try {
      await stopServer(profile.id);
    } catch (err) {
      toast.push(formatError(err), "error");
    } finally {
      setStartStopBusy(false);
    }
  }

  function clearAll() {
    setLines([]);
    if (profile) useServerProcessStore.getState().clearLogs(profile.id);
    lastLogIdx.current = 0;
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = historyIdx === null ? 0 : Math.min(historyIdx + 1, history.length - 1);
      if (history[next] != null) {
        setInput(history[next]);
        setHistoryIdx(next);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = historyIdx === null ? null : historyIdx - 1;
      if (next === null || next < 0) {
        setInput("");
        setHistoryIdx(null);
      } else {
        setInput(history[next]);
        setHistoryIdx(next);
      }
    }
  }

  const startTitle = !profile.serverDirectory.trim()
    ? "Set a server directory on this profile to enable Start"
    : "Start the local server (writes start.bat if missing)";

  return (
    <>
      <div className="page-header">
        <h2>RCON Console</h2>
        <div className="actions">
          <span className={pillClass(proc.state)} title={`Server: ${pillLabel(proc.state)}`}>
            {pillLabel(proc.state)}
          </span>
          <button
            type="button"
            onClick={onStart}
            disabled={startDisabled}
            className="primary"
            title={startTitle}
          >
            <Play size={14} /> Start
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={stopDisabled}
            className="ghost"
            title="Send RCON quit, then force-kill if it doesn't exit in 10s"
          >
            <Square size={14} /> Stop
          </button>
          <button onClick={clearAll} className="ghost">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <SavedCommands
          profileId={profile.id}
          currentInput={input}
          onPick={(cmd) => setInput(cmd)}
        />
        <div className="console" ref={scrollRef}>
          {lines.length === 0 ? (
            <div className="line system">// Try: serverinfo, playerlist, oxide.plugins, banlistex</div>
          ) : (
            lines.map((l, i) => (
              <div
                key={i}
                className={`line ${
                  l.kind === "cmd" ? "cmd" :
                  l.kind === "err" ? "err" :
                  l.kind === "system" ? "system" :
                  ""
                }`}
              >
                <span className="ts">{new Date(l.ts).toLocaleTimeString()}</span>
                {l.text}
              </div>
            ))
          )}
        </div>

        <form className="console-input" onSubmit={submit}>
          <input
            autoFocus
            placeholder="Send an RCON command…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={busy}
          />
          <button className="primary" disabled={busy || !input.trim()}>
            <Send size={14} /> Send
          </button>
        </form>
      </div>
    </>
  );
}

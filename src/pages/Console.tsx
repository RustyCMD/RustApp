import { useEffect, useRef, useState } from "react";
import { Send, Terminal, Trash2 } from "lucide-react";
import { sendRconCommand } from "@/api/tauriCommands";
import { useSelectedProfile } from "@/state/serverStore";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import SavedCommands from "@/components/SavedCommands";

type Line =
  | { kind: "system"; text: string; ts: number }
  | { kind: "cmd"; text: string; ts: number }
  | { kind: "out"; text: string; ts: number }
  | { kind: "err"; text: string; ts: number };

const HISTORY_KEY = "rustapp:console-history";

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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

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
      const msg = String(err);
      setLines((l) => [...l, { kind: "err", text: msg, ts: Date.now() }]);
      toast.push(msg, "error");
    } finally {
      setBusy(false);
    }
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

  return (
    <>
      <div className="page-header">
        <h2>RCON Console</h2>
        <div className="actions">
          <button onClick={() => setLines([])} className="ghost">
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

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Download,
  FolderOpen,
  Loader2,
  RotateCcw,
  Server,
  XCircle,
} from "lucide-react";

import { installRustServer } from "@/api/tauriCommands";
import { useServerStore } from "@/state/serverStore";
import {
  ALL_STAGES,
  STAGE_LABELS,
  useInstallStore,
} from "@/state/installStore";
import { useToast } from "@/components/Toast";
import type { InstallStage } from "@/types/models";

/**
 * Install tab — one-click local Rust dedicated server install.
 *
 * Live progress is read from `useInstallStore`; events are pushed into the
 * store by a single global listener registered in App.tsx. That means the
 * user can navigate away mid-install and come back to a populated log.
 */
export default function InstallPage() {
  const status = useInstallStore((s) => s.status);
  const args = useInstallStore((s) => s.args);
  const currentStage = useInstallStore((s) => s.currentStage);
  const stagesDone = useInstallStore((s) => s.stagesDone);
  const logLines = useInstallStore((s) => s.logLines);
  const warning = useInstallStore((s) => s.warning);
  const error = useInstallStore((s) => s.error);
  const newProfileId = useInstallStore((s) => s.newProfileId);
  const start = useInstallStore((s) => s.start);
  const reset = useInstallStore((s) => s.reset);

  const loadServers = useServerStore((s) => s.load);
  const selectServer = useServerStore((s) => s.select);

  const toast = useToast();
  const navigate = useNavigate();

  // Form state. When an install is in flight, the inputs are pinned to that
  // install's args so the user can see what they kicked off.
  const [name, setName] = useState(args?.name ?? "");
  const [installDir, setInstallDir] = useState(args?.installDir ?? "");
  const [installOxide, setInstallOxide] = useState(args?.installOxide ?? true);

  useEffect(() => {
    // Sync form back to args when navigating in mid-install.
    if (args && status === "running") {
      setName(args.name);
      setInstallDir(args.installDir);
      setInstallOxide(args.installOxide);
    }
  }, [args, status]);

  // When the install finishes, refresh the server list so the new profile
  // shows up in the sidebar / topbar.
  useEffect(() => {
    if (status === "done" && newProfileId) {
      loadServers();
    }
  }, [status, newProfileId, loadServers]);

  // Auto-scroll the log to the bottom unless the user has scrolled up.
  const logRef = useRef<HTMLPreElement | null>(null);
  const stickRef = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logLines.length]);

  const onLogScroll = () => {
    const el = logRef.current;
    if (!el) return;
    stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  };

  const browse = async () => {
    const picked = await open({
      directory: true,
      title: "Choose an empty folder to install the Rust server into",
    });
    if (typeof picked === "string") setInstallDir(picked);
  };

  const formValid =
    name.trim().length > 0 && installDir.trim().length > 0 && status !== "running";

  const startInstall = async () => {
    if (!formValid) return;
    const argsToSend = {
      name: name.trim(),
      installDir: installDir.trim(),
      installOxide,
    };
    start(argsToSend);
    try {
      await installRustServer(argsToSend);
      // Success path: the `done` event already updated the store. Nothing
      // more to do here; the page is now in `status === "done"`.
    } catch (e: any) {
      // The `error` event also fires from the backend, so the store is
      // already in `status === "error"`. We just surface a toast for users
      // who navigated away.
      toast.push(typeof e === "string" ? e : (e?.message ?? "Install failed"), "error");
    }
  };

  const goToServer = () => {
    if (newProfileId) {
      selectServer(newProfileId);
      navigate("/servers");
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Install a Rust server</h2>
        <div className="actions">
          {(status === "done" || status === "error") && (
            <button onClick={reset}>
              <RotateCcw size={14} /> Start another
            </button>
          )}
        </div>
      </div>
      <p className="muted" style={{ maxWidth: 720, marginTop: -8 }}>
        Downloads SteamCMD, fetches the latest Rust dedicated server (Steam
        app <code>258550</code>), optionally drops in <strong>Oxide.Rust</strong>{" "}
        for plugin support, and registers it here so every other tab works
        immediately. Everything happens locally on this PC.
      </p>

      {/* ─── Banners ─── */}
      {status === "running" && (
        <div className="callout callout-info">
          <Loader2 size={18} className="spin" />
          <div>
            <strong>Installing {args?.name}…</strong>
            {currentStage && (
              <div className="muted small" style={{ marginTop: 2 }}>
                {STAGE_LABELS[currentStage]}
              </div>
            )}
          </div>
        </div>
      )}
      {status === "done" && (
        <div className="callout callout-info" style={{ borderColor: "rgba(63,185,80,0.5)", background: "var(--ok-soft)" }}>
          <CheckCircle2 size={18} color="var(--ok)" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 12 }}>
            <div>
              <strong>Installed.</strong> {args?.name} is ready.
              {warning && (
                <div className="muted small" style={{ marginTop: 4 }}>
                  <AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {warning}
                </div>
              )}
            </div>
            <button className="primary" onClick={goToServer}>
              <Server size={14} /> Go to server
            </button>
          </div>
        </div>
      )}
      {status === "error" && error && (
        <div className="callout callout-warn" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)" }}>
          <XCircle size={18} color="var(--bad)" />
          <div>
            <strong>Install failed at {STAGE_LABELS[error.stage]}</strong>
            <pre style={{
              margin: "6px 0 0",
              padding: 0,
              background: "transparent",
              border: 0,
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              color: "var(--text-muted)",
            }}>
              {error.message}
            </pre>
          </div>
        </div>
      )}

      {/* ─── Form ─── */}
      <div className="card install-form">
        <h3>Install settings</h3>
        <div className="stack-lg">
          <label className="field">
            Server name
            <input
              type="text"
              placeholder="e.g. My Test Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={status === "running"}
            />
          </label>
          <label className="field">
            Install directory
            <div className="row" style={{ gap: 8 }}>
              <input
                type="text"
                placeholder="Click Browse to pick an empty folder…"
                value={installDir}
                onChange={(e) => setInstallDir(e.target.value)}
                disabled={status === "running"}
              />
              <button onClick={browse} disabled={status === "running"}>
                <FolderOpen size={14} /> Browse
              </button>
            </div>
            <span className="faint small" style={{ textTransform: "none", letterSpacing: 0 }}>
              The folder must be empty (or already contain a Rust install).
            </span>
          </label>
          <label className="install-checkbox">
            <input
              type="checkbox"
              checked={installOxide}
              onChange={(e) => setInstallOxide(e.target.checked)}
              disabled={status === "running"}
            />
            <span>
              <strong>Install Oxide.Rust</strong>
              <span className="muted small" style={{ display: "block" }}>
                Required for the Plugin Store, plugin configs and the rest of
                RustApp's plugin features. Recommended.
              </span>
            </span>
          </label>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              className="primary"
              disabled={!formValid}
              onClick={startInstall}
            >
              <Download size={14} /> Install
            </button>
          </div>
        </div>
      </div>

      {/* ─── Stages + log (only after a run starts) ─── */}
      {status !== "idle" && (
        <div className="card">
          <h3>Progress</h3>
          <ul className="install-stages">
            {ALL_STAGES.filter((s) => args?.installOxide || !s.startsWith("oxide_")).map((s) => {
              const st = stageStatus(s, currentStage, stagesDone, status, error?.stage);
              return (
                <li key={s} className={`install-stage st-${st}`}>
                  <StageIcon status={st} />
                  <span>{STAGE_LABELS[s]}</span>
                </li>
              );
            })}
          </ul>

          <div className="install-log-wrap">
            <pre
              ref={logRef}
              className="install-log"
              onScroll={onLogScroll}
            >
              {logLines.length === 0 ? (
                <span className="muted">Waiting for output…</span>
              ) : (
                logLines.join("\n")
              )}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}

type StageVisualStatus = "pending" | "active" | "done" | "failed";

function stageStatus(
  s: InstallStage,
  current: InstallStage | null,
  done: InstallStage[],
  overall: "idle" | "running" | "done" | "error",
  failedStage: InstallStage | undefined,
): StageVisualStatus {
  if (overall === "error" && failedStage === s) return "failed";
  if (done.includes(s)) return "done";
  if (current === s) return "active";
  if (overall === "done") return "done";
  return "pending";
}

function StageIcon({ status }: { status: StageVisualStatus }) {
  if (status === "done") return <CheckCircle2 size={16} color="var(--ok)" />;
  if (status === "active") return <Loader2 size={16} className="spin" color="var(--accent)" />;
  if (status === "failed") return <XCircle size={16} color="var(--bad)" />;
  return <Circle size={16} color="var(--text-faint)" />;
}

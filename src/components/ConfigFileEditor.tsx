import { useEffect, useState } from "react";
import { History, RotateCcw, Save } from "lucide-react";
import {
  listConfigBackups,
  loadPluginConfig,
  readConfigBackup,
  restoreConfigBackup,
  savePluginConfig,
} from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import Skeleton from "@/components/Skeleton";
import type { ConfigBackup, ConfigKind, InstalledPlugin } from "@/types/models";

interface Props {
  profileId: string;
  plugin: InstalledPlugin;
  onClose: () => void;
}

type Tab = "edit" | "backups";

export default function ConfigFileEditor({ profileId, plugin, onClose }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("edit");
  const [kind, setKind] = useState<ConfigKind>("json");
  const [content, setContent] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load the live config when kind changes (only matters in the editor tab).
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setDirty(false);
    loadPluginConfig(profileId, plugin.name, kind)
      .then((c) => alive && setContent(c))
      .catch((e) => {
        if (!alive) return;
        setContent("");
        toast.push(`Couldn't load ${kind} config: ${e}`, "error");
      })
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [profileId, plugin.name, kind, toast]);

  async function onSave() {
    setBusy(true);
    try {
      await savePluginConfig(profileId, plugin.name, kind, content);
      toast.push(`Saved ${plugin.name}.${kind}`, "ok");
      setDirty(false);
      onClose();
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  function tryClose() {
    if (dirty && !confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  }

  return (
    <Modal
      title={
        <span>
          {plugin.name}
          <span className="muted small mono" style={{ marginLeft: 8 }}>
            {plugin.name}.{kind}
          </span>
        </span>
      }
      onClose={tryClose}
      size="lg"
      footer={
        tab === "edit" ? (
          <>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ConfigKind)}
              style={{ width: "auto" }}
            >
              <option value="json">JSON</option>
              <option value="ini">INI</option>
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={tryClose}>Cancel</button>
            <button className="primary" onClick={onSave} disabled={busy}>
              <Save size={14} />
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <div style={{ flex: 1 }} />
            <button onClick={onClose}>Close</button>
          </>
        )
      }
    >
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setTab("edit")}
          className={tab === "edit" ? "primary" : "ghost"}
          style={{ borderRadius: 999, padding: "6px 12px" }}
        >
          Editor
        </button>
        <button
          onClick={() => setTab("backups")}
          className={tab === "backups" ? "primary" : "ghost"}
          style={{ borderRadius: 999, padding: "6px 12px" }}
        >
          <History size={14} />
          Backups
        </button>
      </div>

      {tab === "edit" ? (
        <>
          <textarea
            rows={20}
            spellCheck={false}
            style={{ width: "100%" }}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
          />
          <p className="muted small" style={{ marginTop: 8 }}>
            Saves are validated before being written. The previous version is
            kept in <span className="mono">oxide/config/.rustapp-backups/</span>{" "}
            (last 10).
          </p>
        </>
      ) : (
        <BackupBrowser profileId={profileId} pluginName={plugin.name} />
      )}
    </Modal>
  );
}

function BackupBrowser({
  profileId,
  pluginName,
}: {
  profileId: string;
  pluginName: string;
}) {
  const toast = useToast();
  const [backups, setBackups] = useState<ConfigBackup[] | null>(null);
  const [previewing, setPreviewing] = useState<{
    file: string;
    content: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    setBackups(null);
    listConfigBackups(profileId, pluginName)
      .then(setBackups)
      .catch((e) => {
        toast.push(String(e), "error");
        setBackups([]);
      });
  }

  useEffect(reload, [profileId, pluginName]); // eslint-disable-line react-hooks/exhaustive-deps

  async function preview(b: ConfigBackup) {
    try {
      const content = await readConfigBackup(profileId, pluginName, b.fileName);
      setPreviewing({ file: b.fileName, content });
    } catch (e) {
      toast.push(String(e), "error");
    }
  }

  async function restore(b: ConfigBackup) {
    if (!confirm(`Restore ${b.fileName}? Your current config will be backed up first.`)) {
      return;
    }
    setBusy(true);
    try {
      await restoreConfigBackup(profileId, pluginName, b.fileName);
      toast.push(`Restored from ${b.fileName}`, "ok");
      reload();
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (backups === null) {
    return (
      <div className="stack">
        <Skeleton height={28} />
        <Skeleton height={28} />
        <Skeleton height={28} />
      </div>
    );
  }

  if (backups.length === 0) {
    return (
      <div className="muted">
        No backups yet — they're created automatically when you save a config
        from the Editor tab.
      </div>
    );
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Backup</th>
            <th>Modified</th>
            <th>Size</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => (
            <tr key={b.fileName}>
              <td className="mono small">{b.fileName}</td>
              <td className="muted small">
                {b.modified ? new Date(b.modified).toLocaleString() : "—"}
              </td>
              <td className="muted small">{formatBytes(b.sizeBytes)}</td>
              <td className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                <button onClick={() => preview(b)} className="ghost">
                  Preview
                </button>
                <button
                  onClick={() => restore(b)}
                  disabled={busy}
                  className="primary"
                  style={{ padding: "4px 10px" }}
                >
                  <RotateCcw size={12} />
                  Restore
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {previewing && (
        <Modal title={previewing.file} onClose={() => setPreviewing(null)} size="lg">
          <pre
            style={{
              background: "var(--panel-2)",
              padding: 12,
              borderRadius: 8,
              maxHeight: 480,
              overflow: "auto",
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {previewing.content}
          </pre>
        </Modal>
      )}
    </>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

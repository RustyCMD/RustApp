import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { loadPluginConfig, savePluginConfig } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import type { ConfigKind, InstalledPlugin } from "@/types/models";

interface Props {
  profileId: string;
  plugin: InstalledPlugin;
  onClose: () => void;
}

export default function ConfigFileEditor({ profileId, plugin, onClose }: Props) {
  const toast = useToast();
  const [kind, setKind] = useState<ConfigKind>("json");
  const [content, setContent] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

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
      }
    >
      <textarea
        rows={22}
        spellCheck={false}
        style={{ width: "100%" }}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
      />
      <p className="muted small" style={{ marginTop: 8 }}>
        Saves are validated before being written. The previous version is kept
        in <span className="mono">oxide/config/.rustapp-backups/</span>.
      </p>
    </Modal>
  );
}

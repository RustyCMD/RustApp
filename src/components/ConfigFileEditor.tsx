import { useEffect, useState } from "react";
import { loadPluginConfig, savePluginConfig } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
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

  useEffect(() => {
    let alive = true;
    setBusy(true);
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
      onClose();
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Configure {plugin.name}</h3>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value as ConfigKind)}>
            <option value="json">JSON</option>
            <option value="ini">INI</option>
          </select>
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <textarea
        rows={20}
        spellCheck={false}
        style={{ width: "100%" }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
    </div>
  );
}

import { useState } from "react";
import { installPlugin } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import type { PluginMetaData } from "@/types/models";

interface Props {
  profileId: string | null;
  plugin: PluginMetaData;
}

export default function PluginCard({ profileId, plugin }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const canInstall = profileId !== null && plugin.downloadUrl !== null;

  async function onInstall() {
    if (!profileId) {
      toast.push("Pick an active server first.", "error");
      return;
    }
    setBusy(true);
    try {
      const installed = await installPlugin(profileId, plugin.slug);
      toast.push(`Installed ${installed.name}`, "ok");
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <strong>{plugin.name}</strong>{" "}
          {plugin.version && <span className="muted">v{plugin.version}</span>}
          <div className="muted" style={{ fontSize: 12 }}>
            {plugin.author ? `by ${plugin.author}` : "unknown author"}
          </div>
        </div>
        <button
          className="primary"
          onClick={onInstall}
          disabled={busy || !canInstall}
          title={!canInstall ? "Need an active server and a download URL" : undefined}
        >
          {busy ? "Installing…" : "Install"}
        </button>
      </div>
      {plugin.description && (
        <p style={{ marginTop: 8, marginBottom: 0 }}>{plugin.description}</p>
      )}
      {plugin.pageUrl && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <a href={plugin.pageUrl} target="_blank" rel="noreferrer">
            View on uMod
          </a>
        </div>
      )}
    </div>
  );
}

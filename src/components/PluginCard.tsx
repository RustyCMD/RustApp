import { useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { installPlugin } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import type { PluginMetaData } from "@/types/models";
import { formatError } from "@/lib/errors";

interface Props {
  profileId: string | null;
  plugin: PluginMetaData;
  /** Called after a successful install with the plugin's resolved name, so
   *  the store grid can hide it without waiting for a refetch. */
  onInstalled?: (name: string) => void;
}

export default function PluginCard({ profileId, plugin, onInstalled }: Props) {
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
      onInstalled?.(installed.name);
    } catch (e) {
      toast.push(formatError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="plugin-card-mod">
      <div className="row between" style={{ gap: 8 }}>
        <h4>{plugin.name}</h4>
        {plugin.version && (
          <span className="pill info mono">v{plugin.version}</span>
        )}
      </div>
      <div className="muted small">
        {plugin.author ? `by ${plugin.author}` : "unknown author"}
      </div>
      {plugin.description && <div className="desc">{plugin.description}</div>}

      <div className="footer">
        {plugin.pageUrl ? (
          <a
            href={plugin.pageUrl}
            target="_blank"
            rel="noreferrer"
            className="muted small row"
            style={{ gap: 4 }}
          >
            <ExternalLink size={12} />
            uMod
          </a>
        ) : (
          <span />
        )}
        <button
          className="primary"
          onClick={onInstall}
          disabled={busy || !canInstall}
          title={!canInstall ? "Need an active server and a download URL" : undefined}
        >
          {busy ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
          {busy ? "Installing…" : "Install"}
        </button>
      </div>
    </article>
  );
}

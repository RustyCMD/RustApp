import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  exportProfilesToPath,
  importProfilesFromPath,
} from "@/api/tauriCommands";
import ServerProfileForm from "@/components/ServerProfileForm";
import ServerProfileList from "@/components/ServerProfileList";
import { useToast } from "@/components/Toast";
import { useServerStore } from "@/state/serverStore";
import { useThemeStore } from "@/state/themeStore";
import type { ServerProfile } from "@/types/models";

export default function Settings() {
  const [editing, setEditing] = useState<ServerProfile | null>(null);
  const { theme, set } = useThemeStore();
  const reloadProfiles = useServerStore((s) => s.load);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onExport() {
    setBusy(true);
    try {
      const path = await saveDialog({
        title: "Export server profiles",
        defaultPath: "rustapp-profiles.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      const count = await exportProfilesToPath(path);
      toast.push(`Exported ${count} profile${count === 1 ? "" : "s"}`, "ok");
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    try {
      const picked = await openDialog({
        title: "Import server profiles",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof picked !== "string") return;
      const count = await importProfilesFromPath(picked);
      toast.push(`Imported ${count} profile${count === 1 ? "" : "s"}`, "ok");
      reloadProfiles();
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Settings</h2>

      <div className="card">
        <div className="card-header">
          <h3>{editing ? `Edit ${editing.name}` : "New server profile"}</h3>
          {editing && (
            <button onClick={() => setEditing(null)} className="ghost">
              Discard
            </button>
          )}
        </div>
        <ServerProfileForm
          editing={editing}
          onDone={() => setEditing(null)}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          className="row between"
          style={{ padding: "16px 20px", gap: 8 }}
        >
          <h3 style={{ margin: 0 }}>Saved profiles</h3>
          <div className="row" style={{ gap: 8 }}>
            <button onClick={onImport} disabled={busy}>
              <Upload size={14} /> Import…
            </button>
            <button onClick={onExport} disabled={busy}>
              <Download size={14} /> Export…
            </button>
          </div>
        </div>
        <ServerProfileList onEdit={setEditing} />
      </div>

      <div className="card">
        <h3>Appearance</h3>
        <div className="row" style={{ gap: 8 }}>
          <button
            className={theme === "dark" ? "primary" : "ghost"}
            onClick={() => set("dark")}
          >
            Dark
          </button>
          <button
            className={theme === "light" ? "primary" : "ghost"}
            onClick={() => set("light")}
          >
            Light
          </button>
        </div>
      </div>
    </>
  );
}

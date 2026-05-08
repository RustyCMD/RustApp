import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Save, Settings as SettingsIcon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  addServerProfile,
  getLaunchSettings,
  saveLaunchSettings,
  updateServerProfile,
} from "@/api/tauriCommands";
import { useServerStore } from "@/state/serverStore";
import type { LaunchSettings, ServerProfile, ServerProfileInput } from "@/types/models";
import { useToast } from "@/components/Toast";
import { formatError } from "@/lib/errors";

const empty: ServerProfileInput = {
  name: "",
  ipAddress: "",
  rconPort: 28016,
  rconPassword: "",
  serverDirectory: "",
  notes: "",
};

const MAP_LEVELS = [
  "Procedural Map",
  "Barren",
  "HapisIsland",
  "SavasIsland_koth",
] as const;

interface Props {
  /** When set, the form behaves as an "edit" form for that profile. */
  editing?: ServerProfile | null;
  onDone?: () => void;
}

export default function ServerProfileForm({ editing, onDone }: Props) {
  const upsertLocal = useServerStore((s) => s.upsertLocal);
  const toast = useToast();
  const [form, setForm] = useState<ServerProfileInput>(empty);
  const [saving, setSaving] = useState(false);

  // Launch settings state — only meaningful when `editing` is set, since a
  // new profile doesn't have an id to attach settings to yet.
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launch, setLaunch] = useState<LaunchSettings | null>(null);
  const [launchLoading, setLaunchLoading] = useState(false);

  useEffect(() => {
    if (editing) {
      const { id: _id, createdAt: _c, updatedAt: _u, notes, ...rest } = editing;
      setForm({ ...rest, notes: notes ?? "" });
    } else {
      setForm(empty);
    }
    setLaunchOpen(false);
    setLaunch(null);
  }, [editing]);

  // Lazily fetch launch settings the first time the section is expanded.
  useEffect(() => {
    if (!launchOpen || !editing || launch || launchLoading) return;
    setLaunchLoading(true);
    getLaunchSettings(editing.id)
      .then((s) => setLaunch(s))
      .catch((err) => toast.push(formatError(err), "error"))
      .finally(() => setLaunchLoading(false));
  }, [launchOpen, editing, launch, launchLoading, toast]);

  const update = <K extends keyof ServerProfileInput>(k: K, v: ServerProfileInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateLaunch = <K extends keyof LaunchSettings>(k: K, v: LaunchSettings[K]) =>
    setLaunch((s) => (s ? { ...s, [k]: v } : s));

  async function pickDirectory() {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Rust server install folder",
      });
      if (typeof picked === "string") update("serverDirectory", picked);
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = editing
        ? await updateServerProfile({ ...editing, ...form })
        : await addServerProfile(form);
      upsertLocal(saved);
      // If the user touched launch settings, persist them too. The backend
      // also regenerates start.bat as part of save_launch_settings.
      if (editing && launch) {
        try {
          await saveLaunchSettings({ ...launch, profileId: saved.id });
        } catch (err) {
          toast.push(`Profile saved, but launch settings: ${formatError(err)}`, "error");
        }
      }
      toast.push(editing ? "Profile updated" : "Profile created", "ok");
      onDone?.();
      if (!editing) setForm(empty);
    } catch (err) {
      toast.push(formatError(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid" onSubmit={onSubmit}>
      <label className="field full">
        <span>Name</span>
        <input
          required
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="My Rust server"
        />
      </label>

      <label className="field">
        <span>Host / IP</span>
        <input
          required
          value={form.ipAddress}
          onChange={(e) => update("ipAddress", e.target.value)}
          placeholder="127.0.0.1"
        />
      </label>

      <label className="field">
        <span>RCON port</span>
        <input
          required
          type="number"
          min={1}
          max={65535}
          value={form.rconPort}
          onChange={(e) => update("rconPort", Number(e.target.value))}
        />
      </label>

      <label className="field full">
        <span>RCON password</span>
        <input
          required
          type="password"
          value={form.rconPassword}
          onChange={(e) => update("rconPassword", e.target.value)}
          placeholder="••••••••"
        />
      </label>

      <label className="field full">
        <span>Server directory</span>
        <div className="row" style={{ gap: 8 }}>
          <input
            required
            placeholder="/path/to/RustDedicatedServer"
            value={form.serverDirectory}
            onChange={(e) => update("serverDirectory", e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={pickDirectory} title="Browse…">
            <FolderOpen size={14} />
            Browse
          </button>
        </div>
      </label>

      <label className="field full">
        <span>Notes</span>
        <textarea
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Anything you want to remember about this server (free-form)"
        />
      </label>

      {editing && (
        <div className="full" style={{ marginTop: 4 }}>
          <button
            type="button"
            className="ghost"
            onClick={() => setLaunchOpen((o) => !o)}
            style={{ width: "100%", justifyContent: "flex-start" }}
          >
            {launchOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <SettingsIcon size={14} />
            Launch settings (start.bat parameters)
          </button>

          {launchOpen && (
            <div
              className="grid"
              style={{
                marginTop: 12,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--panel-2)",
              }}
            >
              {launchLoading || !launch ? (
                <div className="full" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Loading…
                </div>
              ) : (
                <>
                  <label className="field full">
                    <span>Server hostname (shown in the server browser)</span>
                    <input
                      value={launch.hostname}
                      onChange={(e) => updateLaunch("hostname", e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Identity (folder name)</span>
                    <input
                      value={launch.identity}
                      onChange={(e) => updateLaunch("identity", e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Map level</span>
                    <select
                      value={launch.level}
                      onChange={(e) => updateLaunch("level", e.target.value)}
                    >
                      {MAP_LEVELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {!MAP_LEVELS.includes(launch.level as (typeof MAP_LEVELS)[number]) && (
                        <option value={launch.level}>{launch.level}</option>
                      )}
                    </select>
                  </label>

                  <label className="field full">
                    <span>Description</span>
                    <textarea
                      rows={2}
                      value={launch.description}
                      onChange={(e) => updateLaunch("description", e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Server URL</span>
                    <input
                      value={launch.url}
                      onChange={(e) => updateLaunch("url", e.target.value)}
                      placeholder="https://example.com"
                    />
                  </label>

                  <label className="field">
                    <span>Header image URL</span>
                    <input
                      value={launch.headerImage}
                      onChange={(e) => updateLaunch("headerImage", e.target.value)}
                      placeholder="https://example.com/header.jpg"
                    />
                  </label>

                  <label className="field">
                    <span>Max players</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={launch.maxPlayers}
                      onChange={(e) => updateLaunch("maxPlayers", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>World size</span>
                    <input
                      type="number"
                      min={1000}
                      max={6000}
                      step={100}
                      value={launch.worldsize}
                      onChange={(e) => updateLaunch("worldsize", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>Seed</span>
                    <input
                      type="number"
                      min={0}
                      value={launch.seed}
                      onChange={(e) => updateLaunch("seed", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>Salt</span>
                    <input
                      type="number"
                      min={0}
                      value={launch.salt}
                      onChange={(e) => updateLaunch("salt", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>Server.ip</span>
                    <input
                      value={launch.serverIp}
                      onChange={(e) => updateLaunch("serverIp", e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Server.port (game)</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={launch.serverPort}
                      onChange={(e) => updateLaunch("serverPort", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>Query port</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={launch.queryPort}
                      onChange={(e) => updateLaunch("queryPort", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>Rust+ app.port</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={launch.appPort}
                      onChange={(e) => updateLaunch("appPort", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>Save interval (seconds)</span>
                    <input
                      type="number"
                      min={30}
                      value={launch.saveInterval}
                      onChange={(e) => updateLaunch("saveInterval", Number(e.target.value))}
                    />
                  </label>

                  <label className="field">
                    <span>Tickrate</span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={launch.tickrate}
                      onChange={(e) => updateLaunch("tickrate", Number(e.target.value))}
                    />
                  </label>

                  <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={launch.globalChat}
                      onChange={(e) => updateLaunch("globalChat", e.target.checked)}
                    />
                    <span>Global chat enabled</span>
                  </label>

                  <label className="field full">
                    <span>Extra args (appended verbatim to RustDedicated.exe)</span>
                    <textarea
                      rows={2}
                      value={launch.extraArgs}
                      onChange={(e) => updateLaunch("extraArgs", e.target.value)}
                      placeholder='e.g. +server.censorplayerlist 0'
                    />
                  </label>
                  <div className="full" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Saved here, written to <code>{form.serverDirectory || "<server dir>"}\\start.bat</code> on save.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="actions">
        {editing && (
          <button type="button" onClick={onDone}>
            Cancel
          </button>
        )}
        <button type="submit" className="primary" disabled={saving}>
          <Save size={14} />
          {saving ? "Saving…" : editing ? "Save changes" : "Create profile"}
        </button>
      </div>
    </form>
  );
}

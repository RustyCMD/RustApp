import { useEffect, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  addServerProfile,
  updateServerProfile,
} from "@/api/tauriCommands";
import { useServerStore } from "@/state/serverStore";
import type { ServerProfile, ServerProfileInput } from "@/types/models";
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

  useEffect(() => {
    if (editing) {
      const { id: _id, createdAt: _c, updatedAt: _u, notes, ...rest } = editing;
      setForm({ ...rest, notes: notes ?? "" });
    } else {
      setForm(empty);
    }
  }, [editing]);

  const update = <K extends keyof ServerProfileInput>(k: K, v: ServerProfileInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

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

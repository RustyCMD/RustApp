import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import {
  addSavedCommand,
  deleteSavedCommand,
  listSavedCommands,
} from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import type { SavedCommand } from "@/types/models";
import { formatError } from "@/lib/errors";

interface Props {
  profileId: string;
  /** The text currently in the console input. The Save button uses it. */
  currentInput: string;
  /** Called when the user clicks a saved command — populate the input with it. */
  onPick: (command: string) => void;
}

export default function SavedCommands({ profileId, currentInput, onPick }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<SavedCommand[]>([]);

  const reload = () =>
    listSavedCommands(profileId)
      .then(setItems)
      .catch((e) => toast.push(formatError(e), "error"));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function save() {
    const cmd = currentInput.trim();
    if (!cmd) {
      toast.push("Type a command first.", "info");
      return;
    }
    const label = window.prompt("Label for this command:", cmd.slice(0, 40));
    if (!label) return;
    try {
      const created = await addSavedCommand(profileId, label, cmd);
      setItems((prev) =>
        [...prev, created].sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
        ),
      );
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  async function remove(id: number) {
    try {
      await deleteSavedCommand(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      toast.push(formatError(e), "error");
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="muted small" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>
          Saved commands
        </span>
        <button
          onClick={save}
          className="ghost"
          style={{ padding: "4px 10px", fontSize: 12 }}
          title="Save the current input as a reusable command"
        >
          <Star size={12} />
          Save current
        </button>
      </div>
      {items.length === 0 ? (
        <div className="faint small">
          Star a command to save it here. Click later to reuse it.
        </div>
      ) : (
        <div className="row wrap" style={{ gap: 6 }}>
          {items.map((it) => (
            <span
              key={it.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 4px 4px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--panel-2)",
                fontSize: 12,
              }}
            >
              <button
                onClick={() => onPick(it.command)}
                title={it.command}
                className="ghost"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "inherit",
                  fontSize: 12,
                }}
              >
                {it.label}
              </button>
              <button
                onClick={() => remove(it.id)}
                className="ghost icon"
                title="Delete"
                style={{ padding: 2, color: "var(--text-faint)" }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

import { Copy, Key, MessageSquare } from "lucide-react";
import Modal from "@/components/Modal";
import type { InstalledPlugin } from "@/types/models";

/**
 * Read-only details panel for an installed plugin: metadata, permissions
 * registered via `permission.RegisterPermission(...)`, and chat commands
 * registered via `cmd.AddChatCommand(...)` / `[ChatCommand]`. Pure-local —
 * derived from the .cs file contents at scan time, no RCON involved.
 */
export default function PluginInfoModal({
  plugin,
  onClose,
}: {
  plugin: InstalledPlugin;
  onClose: () => void;
}) {
  return (
    <Modal title={plugin.name} onClose={onClose} size="lg">
      <div className="muted small mono" style={{ marginBottom: 12 }}>
        {plugin.author ?? "unknown author"}
        {plugin.version && ` · v${plugin.version}`}
      </div>

      {plugin.description && (
        <p style={{ marginTop: 0 }}>{plugin.description}</p>
      )}

      <div className="muted small mono" style={{ marginBottom: 16 }}>
        {plugin.filePath}
      </div>

      <Section
        icon={Key}
        title="Permissions"
        empty="This plugin doesn't register any permissions."
        items={plugin.permissions}
      />

      <Section
        icon={MessageSquare}
        title="Chat commands"
        empty="This plugin doesn't register any chat commands."
        items={plugin.chatCommands.map((c) => `/${c}`)}
      />
    </Modal>
  );
}

function Section({
  icon: Icon,
  title,
  empty,
  items,
}: {
  icon: typeof Copy;
  title: string;
  empty: string;
  items: string[];
}) {
  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <h4 className="muted small" style={{ margin: 0, textTransform: "uppercase", letterSpacing: 0.6 }}>
          <Icon size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {title}
        </h4>
        <p className="muted" style={{ marginBottom: 0, marginTop: 8 }}>{empty}</p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <h4 className="muted small" style={{ margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 0.6 }}>
        <Icon size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        {title} ({items.length})
      </h4>
      <div className="row wrap" style={{ gap: 6 }}>
        {items.map((item) => (
          <button
            key={item}
            className="ghost"
            title="Copy"
            onClick={() => navigator.clipboard?.writeText(item).catch(() => {})}
            style={{
              padding: "3px 8px",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              borderRadius: 6,
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

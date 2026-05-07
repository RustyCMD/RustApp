import { useState } from "react";
import ServerProfileForm from "@/components/ServerProfileForm";
import ServerProfileList from "@/components/ServerProfileList";
import { useThemeStore } from "@/state/themeStore";
import type { ServerProfile } from "@/types/models";

export default function Settings() {
  const [editing, setEditing] = useState<ServerProfile | null>(null);
  const { theme, set } = useThemeStore();

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
        <div style={{ padding: "16px 20px" }}>
          <h3 style={{ margin: 0 }}>Saved profiles</h3>
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

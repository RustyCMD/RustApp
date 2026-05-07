import { useState } from "react";
import ServerProfileForm from "@/components/ServerProfileForm";
import ServerProfileList from "@/components/ServerProfileList";
import type { ServerProfile } from "@/types/models";

export default function Settings() {
  const [editing, setEditing] = useState<ServerProfile | null>(null);

  return (
    <>
      <h2>Servers & Settings</h2>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {editing ? `Edit ${editing.name}` : "New server profile"}
        </h3>
        <ServerProfileForm
          editing={editing}
          onDone={() => setEditing(null)}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Saved profiles</h3>
        <ServerProfileList onEdit={setEditing} />
      </div>
    </>
  );
}

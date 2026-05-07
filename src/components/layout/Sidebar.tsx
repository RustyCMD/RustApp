import { NavLink } from "react-router-dom";
import { useServerStore } from "@/state/serverStore";

export default function Sidebar() {
  const { profiles, selectedId, select } = useServerStore();

  return (
    <aside className="sidebar">
      <h1>RustApp</h1>

      <nav>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Dashboard
        </NavLink>
        <NavLink to="/installed" className={({ isActive }) => (isActive ? "active" : "")}>
          Installed Plugins
        </NavLink>
        <NavLink to="/store" className={({ isActive }) => (isActive ? "active" : "")}>
          Plugin Store
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
          Servers & Settings
        </NavLink>
      </nav>

      <div className="footer">
        <div style={{ marginBottom: 6 }}>Active server</div>
        <select
          value={selectedId ?? ""}
          onChange={(e) => select(e.target.value || null)}
        >
          {profiles.length === 0 ? (
            <option value="">No servers configured</option>
          ) : (
            <>
              <option value="">— select —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </>
          )}
        </select>
      </div>
    </aside>
  );
}

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  Store,
  Users,
  Terminal,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useUpdateBadge } from "@/state/updateStore";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const MAIN: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/installed", label: "Installed", icon: Boxes },
  { to: "/store", label: "Plugin Store", icon: Store },
  { to: "/players", label: "Players", icon: Users },
  { to: "/console", label: "Console", icon: Terminal },
];

const META: NavItem[] = [
  { to: "/activity", label: "Activity Log", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const updateCount = useUpdateBadge();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">R</div>
        <div>
          RustApp
          <div className="faint small" style={{ fontWeight: 400 }}>uMod manager</div>
        </div>
      </div>

      <div className="nav-section">Manage</div>
      <nav>
        {MAIN.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <Icon size={16} />
            <span>{label}</span>
            {to === "/installed" && updateCount > 0 && (
              <span className="badge">{updateCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="nav-section">App</div>
      <nav>
        {META.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="footer faint small">v0.1.0</div>
    </aside>
  );
}

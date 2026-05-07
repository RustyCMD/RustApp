import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { ToastProvider } from "@/components/Toast";
import { useServerStore } from "@/state/serverStore";
import { applyThemeToHtml, useThemeStore } from "@/state/themeStore";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import InstalledPluginsPage from "@/pages/InstalledPlugins";
import PluginStorePage from "@/pages/PluginStore";
import ConsolePage from "@/pages/Console";
import PlayersPage from "@/pages/Players";
import ActivityPage from "@/pages/Activity";

export default function App() {
  const load = useServerStore((s) => s.load);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyThemeToHtml(theme);
    load();
  }, [load, theme]);

  return (
    <ToastProvider>
      <div className="layout">
        <Sidebar />
        <TopBar />
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/installed" element={<InstalledPluginsPage />} />
            <Route path="/store" element={<PluginStorePage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/console" element={<ConsolePage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}

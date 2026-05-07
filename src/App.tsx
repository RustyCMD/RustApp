import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { ToastProvider } from "@/components/Toast";
import { useServerStore } from "@/state/serverStore";
import { useInstallStore } from "@/state/installStore";
import { applyThemeToHtml, useThemeStore } from "@/state/themeStore";
import { onInstallProgress } from "@/api/tauriCommands";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import InstalledPluginsPage from "@/pages/InstalledPlugins";
import PluginStorePage from "@/pages/PluginStore";
import ConsolePage from "@/pages/Console";
import PlayersPage from "@/pages/Players";
import ActivityPage from "@/pages/Activity";
import ServersPage from "@/pages/Servers";
import HelpPage from "@/pages/Help";
import InstallPage from "@/pages/Install";

export default function App() {
  const load = useServerStore((s) => s.load);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyThemeToHtml(theme);
    load();
  }, [load, theme]);

  // One global listener for install progress so the Install page can be
  // unmounted (user navigated away) without losing live updates.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onInstallProgress((p) => useInstallStore.getState().apply(p)).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <ToastProvider>
      <div className="layout">
        <Sidebar />
        <TopBar />
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/servers" element={<ServersPage />} />
            <Route path="/install" element={<InstallPage />} />
            <Route path="/installed" element={<InstalledPluginsPage />} />
            <Route path="/store" element={<PluginStorePage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/console" element={<ConsolePage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}

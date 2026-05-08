import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { ToastProvider } from "@/components/Toast";
import { useServerStore } from "@/state/serverStore";
import { useInstallStore } from "@/state/installStore";
import { useServerProcessStore } from "@/state/serverProcessStore";
import { applyThemeToHtml, useThemeStore } from "@/state/themeStore";
import {
  getRunningServers,
  onInstallProgress,
  onServerLog,
  onServerState,
} from "@/api/tauriCommands";
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

  // Global listeners for the local-server process lifecycle. Same rationale
  // as the install listener: the Console tab can be unmounted while the
  // server is running, but the store keeps accumulating logs/state so when
  // the user comes back the buffer is intact.
  useEffect(() => {
    let unState: (() => void) | undefined;
    let unLog: (() => void) | undefined;
    let cancelled = false;
    onServerState((e) => useServerProcessStore.getState().applyState(e)).then((un) => {
      if (cancelled) un();
      else unState = un;
    });
    onServerLog((e) => useServerProcessStore.getState().applyLog(e)).then((un) => {
      if (cancelled) un();
      else unLog = un;
    });
    // Seed from anything that was already running (rare, but: dev reloads).
    getRunningServers()
      .then((ids) => useServerProcessStore.getState().hydrateRunning(ids))
      .catch(() => {});
    return () => {
      cancelled = true;
      unState?.();
      unLog?.();
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

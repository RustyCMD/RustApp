import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { useServerStore } from "@/state/serverStore";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import InstalledPluginsPage from "@/pages/InstalledPlugins";
import PluginStorePage from "@/pages/PluginStore";

export default function App() {
  const load = useServerStore((s) => s.load);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <ToastProvider>
      <div className="layout">
        <Sidebar />
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/installed" element={<InstalledPluginsPage />} />
            <Route path="/store" element={<PluginStorePage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}

import { Server } from "lucide-react";
import InstalledPluginsList from "@/components/InstalledPluginsList";
import EmptyState from "@/components/EmptyState";
import { useSelectedProfile } from "@/state/serverStore";

export default function InstalledPluginsPage() {
  const profile = useSelectedProfile();
  return (
    <>
      <h2>Installed Plugins</h2>
      {!profile ? (
        <div className="card">
          <EmptyState
            icon={Server}
            title="Pick an active server"
            description="Choose a server in the top bar to see its installed plugins."
          />
        </div>
      ) : (
        <InstalledPluginsList profileId={profile.id} />
      )}
    </>
  );
}

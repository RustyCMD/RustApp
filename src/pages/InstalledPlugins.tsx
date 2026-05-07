import InstalledPluginsList from "@/components/InstalledPluginsList";
import { useSelectedProfile } from "@/state/serverStore";

export default function InstalledPluginsPage() {
  const profile = useSelectedProfile();
  return (
    <>
      <h2>Installed Plugins</h2>
      {!profile ? (
        <p className="muted">Pick an active server in the sidebar.</p>
      ) : (
        <InstalledPluginsList profileId={profile.id} />
      )}
    </>
  );
}

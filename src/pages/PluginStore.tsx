import PluginStoreBrowser from "@/components/PluginStoreBrowser";
import { useSelectedProfile } from "@/state/serverStore";

export default function PluginStorePage() {
  const profile = useSelectedProfile();
  return (
    <>
      <h2>Plugin Store</h2>
      {!profile && (
        <p className="muted">
          You can browse without a server selected, but installs are disabled
          until you pick one in the sidebar.
        </p>
      )}
      <PluginStoreBrowser profileId={profile?.id ?? null} />
    </>
  );
}

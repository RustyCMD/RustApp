import { Link } from "react-router-dom";
import { useSelectedProfile, useServerStore } from "@/state/serverStore";
import DependencyChecker from "@/components/DependencyChecker";

export default function Dashboard() {
  const profile = useSelectedProfile();
  const profiles = useServerStore((s) => s.profiles);

  return (
    <>
      <h2>Dashboard</h2>

      {profiles.length === 0 ? (
        <div className="card">
          <p>No server profiles configured yet.</p>
          <p>
            <Link to="/settings">Go to Settings</Link> to add your first server.
          </p>
        </div>
      ) : !profile ? (
        <div className="card">
          <p>Select an active server from the sidebar to see status.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{profile.name}</h3>
            <div className="muted">
              <code>
                {profile.ipAddress}:{profile.rconPort}
              </code>{" "}
              · {profile.serverDirectory}
            </div>
          </div>
          <div className="card">
            <DependencyChecker profileId={profile.id} />
          </div>
        </>
      )}
    </>
  );
}

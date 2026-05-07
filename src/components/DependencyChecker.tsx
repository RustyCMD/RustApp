import { useEffect, useState } from "react";
import { checkCommonDependencies } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import type { DependencyStatus } from "@/types/models";

export default function DependencyChecker({ profileId }: { profileId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<DependencyStatus | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setStatus(await checkCommonDependencies(profileId));
    } catch (e) {
      toast.push(String(e), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Dependencies</h3>
        <button onClick={refresh} disabled={loading}>
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>
      {status && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Looking under <code>{status.managedDir}</code>
          </div>
          {status.missing.length === 0 ? (
            <p>
              <span className="pill on">all required DLLs present</span>
            </p>
          ) : (
            <ul>
              {status.missing.map((m) => (
                <li key={m}>
                  <span className="pill warn">missing</span> {m}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { fetchUmodPlugins } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import PluginCard from "@/components/PluginCard";
import type { PluginStorePage } from "@/types/models";

export default function PluginStoreBrowser({
  profileId,
}: {
  profileId: string | null;
}) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<PluginStorePage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchUmodPlugins(page, search || undefined)
      .then((d) => alive && setData(d))
      .catch((e) => alive && toast.push(String(e), "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [page, search, toast]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(draft.trim());
  }

  return (
    <div>
      <form onSubmit={applySearch} className="row" style={{ marginBottom: 12 }}>
        <input
          placeholder="Search uMod…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" className="primary">
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setSearch("");
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </form>

      {loading && <p className="muted">Loading…</p>}

      {data?.items.length === 0 && !loading && (
        <p className="muted">No results.</p>
      )}

      {data?.items.map((p) => (
        <PluginCard key={p.slug} profileId={profileId} plugin={p} />
      ))}

      <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 12 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
          ← Prev
        </button>
        <span className="muted">Page {data?.page ?? page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!data?.hasNext || loading}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

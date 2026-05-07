import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShoppingBag } from "lucide-react";
import { fetchUmodPlugins } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import PluginCard from "@/components/PluginCard";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
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
      <form onSubmit={applySearch} className="row" style={{ marginBottom: 16, gap: 8 }}>
        <div className="searchbar" style={{ flex: 1 }}>
          <Search size={16} />
          <input
            placeholder="Search uMod plugins…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
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

      {loading ? (
        <div className="plugin-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="plugin-card-mod stack" style={{ gap: 10 }}>
              <Skeleton height={18} width="60%" />
              <Skeleton height={12} width="30%" />
              <Skeleton height={48} />
            </div>
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ShoppingBag}
            title="No results"
            description={
              search
                ? `Nothing matched "${search}"`
                : "uMod returned an empty page — selectors may need updating."
            }
          />
        </div>
      ) : (
        <div className="plugin-grid">
          {data?.items.map((p) => (
            <PluginCard key={p.slug} profileId={profileId} plugin={p} />
          ))}
        </div>
      )}

      <div className="row" style={{ justifyContent: "center", gap: 12, marginTop: 20 }}>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          className="ghost"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="muted small">Page {data?.page ?? page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!data?.hasNext || loading}
          className="ghost"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

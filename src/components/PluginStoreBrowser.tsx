import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, ShoppingBag } from "lucide-react";
import { fetchUmodPlugins, getInstalledPlugins } from "@/api/tauriCommands";
import { useToast } from "@/components/Toast";
import PluginCard from "@/components/PluginCard";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import type { PluginStorePage } from "@/types/models";
import { formatError } from "@/lib/errors";

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
  // Lowercase plugin names already on disk for the active server. Used to
  // hide store entries the user has already installed. Empty when no
  // profile is selected — browsing-only mode shows everything.
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchUmodPlugins(page, search || undefined)
      .then((d) => alive && setData(d))
      .catch((e) => alive && toast.push(formatError(e), "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [page, search, toast]);

  useEffect(() => {
    if (!profileId) {
      setInstalledNames(new Set());
      return;
    }
    let alive = true;
    getInstalledPlugins(profileId)
      .then((list) => {
        if (!alive) return;
        setInstalledNames(new Set(list.map((p) => p.name.toLowerCase())));
      })
      .catch(() => {
        // Non-fatal — just don't filter. The store still works.
        if (alive) setInstalledNames(new Set());
      });
    return () => {
      alive = false;
    };
  }, [profileId]);

  const markInstalled = useCallback((name: string) => {
    setInstalledNames((prev) => {
      const next = new Set(prev);
      next.add(name.toLowerCase());
      return next;
    });
  }, []);

  const visibleItems = (data?.items ?? []).filter(
    (it) => !installedNames.has(it.name.toLowerCase()),
  );
  const hiddenCount = (data?.items.length ?? 0) - visibleItems.length;

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
      ) : visibleItems.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ShoppingBag}
            title={hiddenCount > 0 ? "All on this page already installed" : "No results"}
            description={
              hiddenCount > 0
                ? `Hid ${hiddenCount} plugin${hiddenCount === 1 ? "" : "s"} you already have. Try the next page.`
                : search
                  ? `Nothing matched "${search}"`
                  : "uMod returned an empty page — selectors may need updating."
            }
          />
        </div>
      ) : (
        <>
          <div className="plugin-grid">
            {visibleItems.map((p) => (
              <PluginCard
                key={p.slug}
                profileId={profileId}
                plugin={p}
                onInstalled={markInstalled}
              />
            ))}
          </div>
          {hiddenCount > 0 && (
            <p className="muted small" style={{ marginTop: 12, textAlign: "center" }}>
              {hiddenCount} plugin{hiddenCount === 1 ? "" : "s"} on this page hidden — already installed.
            </p>
          )}
        </>
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

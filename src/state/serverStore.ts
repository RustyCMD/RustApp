import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ServerProfile } from "@/types/models";
import { getServerProfiles } from "@/api/tauriCommands";
import { formatError } from "@/lib/errors";

interface ServerState {
  profiles: ServerProfile[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  select: (id: string | null) => void;
  /** Local-only update — caller is responsible for persisting via the API. */
  upsertLocal: (profile: ServerProfile) => void;
  removeLocal: (id: string) => void;
}

export const useServerStore = create<ServerState>()(
  persist(
    (set, get) => ({
      profiles: [],
      selectedId: null,
      loading: false,
      error: null,

      async load() {
        set({ loading: true, error: null });
        try {
          const profiles = await getServerProfiles();
          set((s) => ({
            profiles,
            // Drop the persisted selection if that profile no longer exists.
            selectedId:
              s.selectedId && profiles.some((p) => p.id === s.selectedId)
                ? s.selectedId
                : (profiles[0]?.id ?? null),
            loading: false,
          }));
        } catch (e) {
          set({ loading: false, error: formatError(e) });
        }
      },

      select(id) {
        set({ selectedId: id });
      },

      upsertLocal(profile) {
        const profiles = get().profiles.slice();
        const idx = profiles.findIndex((p) => p.id === profile.id);
        if (idx >= 0) profiles[idx] = profile;
        else profiles.push(profile);
        set({
          profiles,
          selectedId: get().selectedId ?? profile.id,
        });
      },

      removeLocal(id) {
        const profiles = get().profiles.filter((p) => p.id !== id);
        set({
          profiles,
          selectedId:
            get().selectedId === id ? (profiles[0]?.id ?? null) : get().selectedId,
        });
      },
    }),
    {
      name: "rustapp:server-store",
      // Only persist the *selection* — the actual profile list is the DB's
      // job, and we always reload it on app start.
      partialize: (s) => ({ selectedId: s.selectedId }) as Partial<ServerState>,
    },
  ),
);

export function useSelectedProfile(): ServerProfile | null {
  const { profiles, selectedId } = useServerStore();
  return profiles.find((p) => p.id === selectedId) ?? null;
}


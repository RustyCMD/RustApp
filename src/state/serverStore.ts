import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ServerProfile } from "@/types/models";
import { getServerProfiles, syncProfileFromStartBat } from "@/api/tauriCommands";
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

          // Self-heal: if any profile has no RCON password but its
          // server_directory has a start.bat with one configured, import it.
          // Stops the empty-password polling that gets the app's IP banned.
          const needsSync = profiles.filter((p) => !p.rconPassword);
          if (needsSync.length > 0) {
            const updates = await Promise.all(
              needsSync.map(async (p) => {
                try {
                  const imported = await syncProfileFromStartBat(p.id);
                  return imported ? { ...p, rconPassword: imported } : null;
                } catch {
                  return null;
                }
              }),
            );
            const merged = updates.filter((u): u is ServerProfile => u !== null);
            if (merged.length > 0) {
              set((s) => ({
                profiles: s.profiles.map(
                  (p) => merged.find((m) => m.id === p.id) ?? p,
                ),
              }));
            }
          }
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


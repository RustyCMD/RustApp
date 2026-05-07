import { create } from "zustand";
import { checkForPluginUpdates } from "@/api/tauriCommands";

interface UpdateState {
  pending: Record<string, string[]>; // profileId -> plugin names with updates
  refresh: (profileId: string) => Promise<void>;
  clearProfile: (profileId: string) => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  pending: {},
  async refresh(profileId) {
    try {
      const ups = await checkForPluginUpdates(profileId);
      set({
        pending: {
          ...get().pending,
          [profileId]: ups.map((u) => u.pluginName),
        },
      });
    } catch {
      // Silent — store is best-effort.
    }
  },
  clearProfile(profileId) {
    const { [profileId]: _, ...rest } = get().pending;
    set({ pending: rest });
  },
}));

import { useServerStore } from "@/state/serverStore";

/** Count of pending updates for the currently active profile. */
export function useUpdateBadge(): number {
  const selectedId = useServerStore((s) => s.selectedId);
  const pending = useUpdateStore((s) => s.pending);
  if (!selectedId) return 0;
  return pending[selectedId]?.length ?? 0;
}

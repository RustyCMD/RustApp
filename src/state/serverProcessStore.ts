// Per-profile local-server lifecycle state. Backed by a single
// `listen("server-state")` + `listen("server-log")` pair registered at app
// startup in App.tsx — same pattern as installStore. The Console tab reads
// state + recent logs from here so toggling tabs doesn't drop output.

import { create } from "zustand";
import type {
  ServerLifecycleState,
  ServerLogEvent,
  ServerStateEvent,
} from "@/types/models";

const MAX_LOG_LINES = 1000;

export interface PerProfile {
  state: ServerLifecycleState;
  pid: number | null;
  exitCode: number | null;
  /** Newest line last. */
  logs: ServerLogEvent[];
}

interface Store {
  byProfile: Record<string, PerProfile>;

  applyState: (e: ServerStateEvent) => void;
  applyLog: (e: ServerLogEvent) => void;
  /** Clear the visible log buffer for a profile (state untouched). */
  clearLogs: (profileId: string) => void;
  /** Initial seed from `get_running_servers` on app boot. */
  hydrateRunning: (ids: string[]) => void;
}

const blank = (): PerProfile => ({
  state: "stopped",
  pid: null,
  exitCode: null,
  logs: [],
});

export const useServerProcessStore = create<Store>((set) => ({
  byProfile: {},

  applyState(e) {
    set((s) => {
      const prev = s.byProfile[e.profileId] ?? blank();
      return {
        byProfile: {
          ...s.byProfile,
          [e.profileId]: {
            ...prev,
            state: e.state,
            pid: e.pid ?? prev.pid,
            exitCode: e.code ?? null,
          },
        },
      };
    });
  },

  applyLog(e) {
    set((s) => {
      const prev = s.byProfile[e.profileId] ?? blank();
      const next = prev.logs.length >= MAX_LOG_LINES
        ? [...prev.logs.slice(prev.logs.length - MAX_LOG_LINES + 1), e]
        : [...prev.logs, e];
      return {
        byProfile: {
          ...s.byProfile,
          [e.profileId]: { ...prev, logs: next },
        },
      };
    });
  },

  clearLogs(profileId) {
    set((s) => {
      const prev = s.byProfile[profileId];
      if (!prev) return {};
      return {
        byProfile: {
          ...s.byProfile,
          [profileId]: { ...prev, logs: [] },
        },
      };
    });
  },

  hydrateRunning(ids) {
    set((s) => {
      const next = { ...s.byProfile };
      for (const id of ids) {
        const prev = next[id] ?? blank();
        next[id] = { ...prev, state: "running" };
      }
      return { byProfile: next };
    });
  },
}));

/** Convenience selector — returns blank state if the profile has no entry. */
export function useProfileProcess(profileId: string | null | undefined): PerProfile {
  return useServerProcessStore(
    (s) => (profileId && s.byProfile[profileId]) || blank(),
  );
}

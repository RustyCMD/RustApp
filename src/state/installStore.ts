// Holds install state across navigations so the user can leave the Install
// page mid-install and come back to a live, populated log. Backed by a single
// `listen("install-progress")` registered at app startup in App.tsx.

import { create } from "zustand";
import type { InstallArgs, InstallProgress, InstallStage } from "@/types/models";

const MAX_LOG_LINES = 2000;

export const ALL_STAGES: InstallStage[] = [
  "prepare",
  "download_steamcmd",
  "extract_steamcmd",
  "run_steamcmd",
  "verify",
  "oxide_download",
  "oxide_extract",
  "oxide_dirs",
  "register_profile",
];

export const STAGE_LABELS: Record<InstallStage, string> = {
  prepare: "Prepare install directory",
  download_steamcmd: "Download SteamCMD",
  extract_steamcmd: "Extract SteamCMD",
  run_steamcmd: "Run SteamCMD (download Rust)",
  verify: "Verify RustDedicated.exe",
  oxide_download: "Download Oxide.Rust",
  oxide_extract: "Extract Oxide over install",
  oxide_dirs: "Prepare oxide/ folders",
  register_profile: "Register server with RustApp",
};

type Status = "idle" | "running" | "done" | "error";

interface InstallState {
  status: Status;
  args: InstallArgs | null;
  currentStage: InstallStage | null;
  stagesDone: InstallStage[];
  logLines: string[];
  warning: string | null;
  error: { stage: InstallStage; message: string } | null;
  newProfileId: string | null;

  start: (args: InstallArgs) => void;
  apply: (p: InstallProgress) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as Status,
  args: null,
  currentStage: null,
  stagesDone: [],
  logLines: [],
  warning: null,
  error: null,
  newProfileId: null,
};

export const useInstallStore = create<InstallState>((set, get) => ({
  ...initial,

  start(args) {
    set({ ...initial, status: "running", args });
  },

  apply(p) {
    const s = get();
    // Ignore stray events when no install has been started — happens e.g. if
    // the backend is still wrapping up after the user clicked Reset.
    if (s.status === "idle") return;

    switch (p.kind) {
      case "stage": {
        // Mark the previous current stage as done.
        const stagesDone =
          s.currentStage && !s.stagesDone.includes(s.currentStage)
            ? [...s.stagesDone, s.currentStage]
            : s.stagesDone;
        set({ currentStage: p.stage, stagesDone });
        break;
      }
      case "log": {
        const next = [...s.logLines, p.line];
        if (next.length > MAX_LOG_LINES) next.splice(0, next.length - MAX_LOG_LINES);
        set({ logLines: next });
        break;
      }
      case "warning": {
        set({ warning: p.message });
        break;
      }
      case "done": {
        const stagesDone =
          s.currentStage && !s.stagesDone.includes(s.currentStage)
            ? [...s.stagesDone, s.currentStage]
            : s.stagesDone;
        set({
          status: "done",
          stagesDone,
          currentStage: null,
          newProfileId: p.profileId,
        });
        break;
      }
      case "error": {
        set({
          status: "error",
          error: { stage: p.stage, message: p.message },
          currentStage: null,
        });
        break;
      }
    }
  },

  reset() {
    set({ ...initial });
  },
}));

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggle: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      set: (t) => set({ theme: t }),
    }),
    { name: "rustapp:theme" },
  ),
);

/** Mirrors the persisted theme onto `<html data-theme="…">`. Call once at boot. */
export function applyThemeToHtml(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

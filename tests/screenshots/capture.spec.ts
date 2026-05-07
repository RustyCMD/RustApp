import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` doesn't exist in ESM. The package is `"type": "module"` so
// derive it from `import.meta.url` instead.
const here = path.dirname(fileURLToPath(import.meta.url));

const MOCK = fs.readFileSync(path.join(here, "mock-tauri.js"), "utf-8");

const OUT = path.join(here, "output");
fs.mkdirSync(OUT, { recursive: true });

interface Route {
  /** Filename (no extension) */
  name: string;
  /** Visible link label in the sidebar to click. */
  navLabel: string;
  /** A selector that, once present, signals the page has rendered. */
  ready: string;
}

// Routes are reached by clicking the sidebar link rather than `goto`-ing
// directly, so we sidestep any SPA-fallback differences between dev and
// preview servers. The first one is the dashboard which loads at `/`.
const ROUTES: Route[] = [
  { name: "01-dashboard", navLabel: "Dashboard",      ready: ".stat-tile" },
  { name: "02-installed", navLabel: "Installed",      ready: "table tbody tr" },
  { name: "03-store",     navLabel: "Plugin Store",   ready: ".plugin-card-mod" },
  { name: "04-players",   navLabel: "Players",        ready: "table tbody tr" },
  { name: "05-console",   navLabel: "Console",        ready: ".console" },
  { name: "06-activity",  navLabel: "Activity Log",   ready: "table tbody tr" },
  { name: "07-settings",  navLabel: "Settings",       ready: "form.grid" },
];

const THEMES = ["dark", "light"] as const;

for (const theme of THEMES) {
  test(`${theme} theme — every route`, async ({ page }) => {
    await prime(page, theme);

    // Boot at the root. The app reads the persisted theme on mount.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".sidebar .brand")).toBeVisible({
      timeout: 8_000,
    });

    for (const route of ROUTES) {
      // Click the sidebar nav link by its visible label.
      await page
        .locator(".sidebar nav a", { hasText: route.navLabel })
        .first()
        .click();

      await expect(page.locator(route.ready).first()).toBeVisible({
        timeout: 8_000,
      });
      // Let async invokes + transitions settle.
      await page.waitForTimeout(400);

      const file = path.join(OUT, `${theme}-${route.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
    }
  });
}

async function prime(page: Page, theme: "dark" | "light") {
  // Inject the mock IPC bridge before the React bundle's modules execute.
  await page.addInitScript({ content: MOCK });
  // Override the persisted theme based on the current matrix entry. This
  // runs *after* the mock script's pre-seed, so it wins.
  await page.addInitScript({
    content: `try {
      window.localStorage.setItem(
        "rustapp:theme",
        JSON.stringify({ state: { theme: ${JSON.stringify(theme)} }, version: 0 })
      );
    } catch {}`,
  });
}

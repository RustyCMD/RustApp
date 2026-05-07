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
  /** URL path on the static server (must include leading slash). */
  url: string;
  /** Filename (no extension). */
  name: string;
  /** A selector that, once present, signals the page has rendered. */
  ready: string;
}

const ROUTES: Route[] = [
  { url: "/",          name: "01-dashboard", ready: ".stat-tile" },
  { url: "/installed", name: "02-installed", ready: "table tbody tr" },
  { url: "/store",     name: "03-store",     ready: ".plugin-card-mod" },
  { url: "/players",   name: "04-players",   ready: "table tbody tr" },
  { url: "/console",   name: "05-console",   ready: ".console" },
  { url: "/activity",  name: "06-activity",  ready: "table tbody tr" },
  { url: "/settings",  name: "07-settings",  ready: "form.grid" },
];

const THEMES = ["dark", "light"] as const;

for (const theme of THEMES) {
  test(`${theme} theme — every route`, async ({ page }) => {
    // Capture browser-side errors so any future failure has actionable
    // diagnostics in the workflow log instead of a bare timeout.
    page.on("pageerror", (e) => console.log("[browser pageerror]", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.log("[browser console]", m.text());
    });

    await prime(page, theme);

    // Load the SPA once. Every subsequent route change is client-side via
    // history.pushState + popstate so the mock IPC bridge and seeded
    // stores stay applied throughout — full navigations were re-running
    // the page in a state where React Router sometimes failed to settle
    // before the assertion deadline.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".sidebar .brand").first()).toBeVisible({
      timeout: 10_000,
    });

    for (const route of ROUTES) {
      // React Router v6 listens to `popstate`. pushState changes the URL
      // without firing it on its own, so we dispatch one manually.
      await page.evaluate((url) => {
        window.history.pushState({}, "", url);
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      }, route.url);

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
  await page.addInitScript({
    content: `try {
      window.localStorage.setItem(
        "rustapp:theme",
        JSON.stringify({ state: { theme: ${JSON.stringify(theme)} }, version: 0 })
      );
    } catch {}`,
  });
}

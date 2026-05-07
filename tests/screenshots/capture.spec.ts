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
  { url: "/servers",   name: "02-servers",   ready: ".server-card" },
  { url: "/installed", name: "03-installed", ready: "table tbody tr" },
  { url: "/store",     name: "04-store",     ready: ".plugin-card-mod" },
  { url: "/players",   name: "05-players",   ready: "table tbody tr" },
  { url: "/console",   name: "06-console",   ready: ".console" },
  { url: "/activity",  name: "07-activity",  ready: "table tbody tr" },
  { url: "/help",      name: "08-help",      ready: ".setup-card" },
  { url: "/settings",  name: "09-settings",  ready: "form.grid" },
];

const THEMES = ["dark", "light"] as const;

// One test per (theme, route). Each gets its own fresh browser context, so
// any post-screenshot hang in one test can't poison the others. Earlier
// attempts that looped through routes inside a single test would hang
// permanently after the first screenshot in that test, taking the rest
// of the routes down with them.
for (const theme of THEMES) {
  for (const route of ROUTES) {
    test(`${theme} · ${route.name}`, async ({ page }) => {
      // Capture browser-side errors so a future failure has actionable
      // diagnostics in the workflow log instead of a bare timeout.
      page.on("pageerror", (e) =>
        console.log(`[${theme}/${route.name}] pageerror:`, e.message),
      );
      page.on("console", (m) => {
        if (m.type() === "error") {
          console.log(`[${theme}/${route.name}] console.error:`, m.text());
        }
      });

      await prime(page, theme);

      await page.goto(route.url, { waitUntil: "load" });

      await expect(page.locator(".sidebar .brand").first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.locator(route.ready).first()).toBeVisible({
        timeout: 10_000,
      });
      // Let async invokes + transitions settle.
      await page.waitForTimeout(500);

      await page.screenshot({
        path: path.join(OUT, `${theme}-${route.name}.png`),
        fullPage: false,
      });
    });
  }
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

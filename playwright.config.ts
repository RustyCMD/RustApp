import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./tests/screenshots",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 30_000,

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    // Slightly more deterministic font metrics across runs.
    deviceScaleFactor: 1,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Build dist/ before launching, then serve it with `serve --single` so
  // every URL falls back to index.html — that lets each test do a direct
  // page.goto(route) instead of clicking through React Router's NavLink,
  // which `vite preview` would hang on in CI.
  webServer: {
    command: `npm run build && npx serve dist --single --listen ${PORT} --no-clipboard`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

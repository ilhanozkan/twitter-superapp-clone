import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build (`npm run build` first) on
// the in-memory demo store, so they need no network or credentials.
const port = Number(process.env.E2E_PORT ?? 3005);

export default defineConfig({
  testDir: "e2e",
  // The demo store is shared server state: run tests one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 900 },
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATA_SOURCE: "memory", WRITE_RATE_LIMIT: "0" },
  },
});

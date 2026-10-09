import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build (`npm run build` first) on
// the in-memory demo store, so they need no network or credentials. Each
// project gets its own server on the same build: E2E_PORT for the demo user,
// the next port for a second identity, the one after for a read-only demo.
const port = Number(process.env.E2E_PORT ?? 3005);
const ports = { chromium: port, sarah: port + 1, readonly: port + 2 };
const baseURL = (projectPort: number) => `http://localhost:${projectPort}`;

// Pinned so a variable exported in the shell can't change who the tests act as.
const DEFAULT_ENV = {
  DATA_SOURCE: "memory",
  WRITE_RATE_LIMIT: "0",
  DEMO_USERNAME: "",
  READ_ONLY: "",
  DISABLED_FEATURES: "",
  SUPERAPP_TIME_SCALE: "",
};

function server(projectPort: number, env: Record<string, string>) {
  return {
    command: `npx next start -p ${projectPort}`,
    url: `${baseURL(projectPort)}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...DEFAULT_ENV, ...env },
  };
}

const desktop = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1366, height: 900 },
};

export default defineConfig({
  testDir: "e2e",
  // The demo stores are shared server state: run tests one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /\.(sarah|readonly)\.spec\.ts$/,
      use: { ...desktop, baseURL: baseURL(ports.chromium) },
    },
    {
      // A second identity, for what only the other party may (not) see.
      name: "sarah",
      testMatch: /\.sarah\.spec\.ts$/,
      use: { ...desktop, baseURL: baseURL(ports.sarah) },
    },
    {
      name: "readonly",
      testMatch: /\.readonly\.spec\.ts$/,
      use: { ...desktop, baseURL: baseURL(ports.readonly) },
    },
  ],
  webServer: [
    server(ports.chromium, { SUPERAPP_TIME_SCALE: "60" }),
    server(ports.sarah, {
      DEMO_USERNAME: "sarahcodes",
      SUPERAPP_TIME_SCALE: "60",
    }),
    server(ports.readonly, { READ_ONLY: "true" }),
  ],
});

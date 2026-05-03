import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Tests share the seeded development DB and a single dev server.
  // Several specs flip seeded approval state (e.g. globex-health
  // PENDING → APPROVED → PENDING) which races other specs that
  // assert the canonical state. Run a single worker so the suite
  // is deterministic. Each spec already uses unique signup emails
  // for fresh fixtures so cross-test contamination of new accounts
  // isn't an issue; the constraint is on shared seeded rows only.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 120_000,
  },
});

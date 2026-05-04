import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // ───────────────────────────────────────────────────────────────────
  // INTENTIONALLY SERIAL — DO NOT RE-ENABLE PARALLELISM WITHOUT FIXING
  // SHARED SEEDED-STATE MUTATIONS FIRST.
  //
  // The Playwright suite runs against the dev server + the dev
  // PostgreSQL database, which shares the *seeded* fixtures across
  // every test. Several specs mutate that shared state — e.g.
  // tests/e2e/admin-approval.spec.ts flips globex-health from PENDING
  // → APPROVED → PENDING, while tests/e2e/public-jobs.spec.ts and
  // tests/e2e/onboarding-routing.spec.ts assert globex-health is
  // canonically PENDING. Under fullyParallel: true with multiple
  // workers, those specs race and the suite flakes intermittently.
  //
  // Per-spec fixtures (signup emails, brand-new postings) already use
  // unique-per-run identifiers so cross-test contamination of FRESH
  // rows isn't an issue. The constraint is purely on the shared
  // seeded canonical rows.
  //
  // To safely turn parallelism back on:
  //   1. Move every spec that mutates seeded data onto its own
  //      isolated DB (per-worker schema or per-test transaction-rollback).
  //   2. OR refactor those specs to use freshly-created fixtures so
  //      they never touch the canonical seeded rows.
  //   3. Then flip these flags and re-verify the suite is stable.
  // ───────────────────────────────────────────────────────────────────
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

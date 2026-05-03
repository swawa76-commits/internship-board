import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers/sign-in";
import { E2E_PASSWORD } from "./helpers/setup";

/**
 * Admin operational journey: dashboard, every management table,
 * activity audit log, and a non-admin reaching the audit log gets
 * bounced. Sanity-checks that each route renders its key landmarks
 * without errors against seed data — not the per-row business logic
 * (those are covered by integration + admin-approval specs).
 */
test.describe.configure({ mode: "serial" });

const ADMIN_EMAIL = "admin@example.test";

test("admin loads /admin and sees dashboard sections", async ({ page }) => {
  await signInAs(page, ADMIN_EMAIL, E2E_PASSWORD);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: /^Admin dashboard$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Overview metrics/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Funnel snapshot/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Operational alerts/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Top performing job postings/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Company participation/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Recent activity/i }),
  ).toBeVisible();
});

test("admin can open every management table", async ({ page }) => {
  await signInAs(page, ADMIN_EMAIL, E2E_PASSWORD);

  await page.goto("/admin/companies");
  await expect(
    page.getByRole("heading", { name: /^Companies$/ }),
  ).toBeVisible();
  // Seeded data ensures at least Acme Robotics is present.
  await expect(
    page.locator("tr").filter({ hasText: "Acme Robotics" }).first(),
  ).toBeVisible();

  await page.goto("/admin/jobs");
  await expect(
    page.getByRole("heading", { name: /^Job postings$/ }),
  ).toBeVisible();
  // Status filter dropdown is present.
  await expect(page.getByLabel(/^Status$/)).toBeVisible();

  await page.goto("/admin/students");
  await expect(
    page.getByRole("heading", { name: /^Students$/ }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Profile$/)).toBeVisible();

  await page.goto("/admin/applications");
  await expect(
    page.getByRole("heading", { name: /^Applications$/ }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Status$/)).toBeVisible();
});

test("admin opens the audit activity log and can filter by event type", async ({
  page,
}) => {
  await signInAs(page, ADMIN_EMAIL, E2E_PASSWORD);
  await page.goto("/admin/activity");
  await expect(
    page.getByRole("heading", { name: /Activity audit/i }),
  ).toBeVisible();

  // Apply an event-type filter and submit. The seed creates a
  // baseline of activity rows; STUDENT_SIGNUP is the safest value to
  // assert because every seeded student fired one.
  await page.getByLabel(/Event type/i).selectOption("STUDENT_SIGNUP");
  await page.getByRole("button", { name: /^apply$/i }).click();

  // The table should show at least one STUDENT_SIGNUP row. Scope the
  // assertion to the rendered <table> so the matching <option value>
  // in the filter dropdown doesn't satisfy it.
  await expect(
    page.getByRole("table").getByText("STUDENT_SIGNUP").first(),
  ).toBeVisible();
});

test("a STUDENT cannot reach /admin/activity (proxy redirect)", async ({
  page,
}) => {
  await signInAs(page, "student01@example.test", E2E_PASSWORD);
  await page.goto("/admin/activity");
  await expect(page).toHaveURL(/\/$/);
});

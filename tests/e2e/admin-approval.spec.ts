import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers/sign-in";

const PASSWORD = "Password123!";

/**
 * Admin can flip a seeded company's approval status from /admin/companies.
 *
 * This test mutates seeded data: the seeded `globex@example.test`
 * company starts at PENDING. The test approves it, asserts the row's
 * status updated, then sets it back to PENDING to leave the dataset as
 * found. The seed is idempotent so even if cleanup were skipped, a
 * subsequent `npm run db:seed` would restore the canonical state.
 */
test("admin can flip a PENDING company to APPROVED via /admin/companies", async ({
  page,
}) => {
  await signInAs(page, "admin@example.test", PASSWORD);
  await page.goto("/admin/companies");
  await expect(
    page.getByRole("heading", { name: /^Companies$/ }),
  ).toBeVisible();

  // Locate the Globex Health row.
  const globexRow = page.locator("tr").filter({ hasText: "Globex Health" });
  await expect(globexRow).toBeVisible();
  await expect(globexRow.getByText("PENDING", { exact: true })).toBeVisible();

  // Approve. The Approve button submits a server action.
  await globexRow.getByRole("button", { name: "Approve" }).click();

  // After revalidation, the badge should update.
  await expect(globexRow.getByText("APPROVED", { exact: true })).toBeVisible();

  // Restore canonical state for re-runs.
  await globexRow.getByRole("button", { name: "Set pending" }).click();
  await expect(globexRow.getByText("PENDING", { exact: true })).toBeVisible();
});

test("a STUDENT cannot reach /admin/companies (proxy redirect)", async ({
  page,
}) => {
  await signInAs(page, "student01@example.test", PASSWORD);
  await page.goto("/admin/companies");
  await expect(page).toHaveURL(/\/$/);
});

test("a COMPANY cannot reach /admin/companies (proxy redirect)", async ({
  page,
}) => {
  await signInAs(page, "acme@example.test", PASSWORD);
  await page.goto("/admin/companies");
  await expect(page).toHaveURL(/\/$/);
});

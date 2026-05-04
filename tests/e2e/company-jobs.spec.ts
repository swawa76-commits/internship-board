import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers/sign-in";

const PASSWORD = "Password123!";

/**
 * PENDING company tries to publish — server action rejects with the
 * "must be approved" message; the user stays on the form with their
 * values intact, then saves a draft successfully.
 *
 * Uses globex@example.test (seeded as PENDING).
 */
test("a PENDING company is blocked from Publish but can save a draft", async ({
  page,
}) => {
  const uniqueTitle = `E2E Pending ${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  await signInAs(page, "globex@example.test", PASSWORD);
  await page.goto("/company/jobs/new");

  // Inline approval banner is visible.
  await expect(page.getByText(/Your company is currently/i)).toBeVisible();

  // Fill the required fields and try to publish.
  await page.getByLabel(/^Title/).fill(uniqueTitle);
  await page
    .getByLabel(/^Description/)
    .fill("A posting we expect to be blocked from publishing.");
  await page.getByRole("button", { name: /^Publish$/ }).click();

  // Server action rejects with the publish_blocked message.
  await expect(
    page.getByRole("alert").filter({
      hasText:
        /Your company must be approved before this job can be published/i,
    }),
  ).toBeVisible();

  // Form values are preserved (uncontrolled defaults + no redirect).
  await expect(page.getByLabel(/^Title/)).toHaveValue(uniqueTitle);

  // The user can still save the draft. This redirects to /company/jobs
  // and the new draft row is visible in the table.
  await page.getByRole("button", { name: /^Save as draft$/ }).click();
  await expect(page).toHaveURL(/\/company\/jobs$/);
  const row = page.locator("tr").filter({ hasText: uniqueTitle });
  await expect(row).toBeVisible();
  await expect(row.getByText("DRAFT", { exact: true })).toBeVisible();

  // Cleanup: soft-delete the row so reruns aren't noisy.
  await row.getByRole("button", { name: /^Delete / }).click();
});

/**
 * APPROVED company can publish a posting end-to-end. Uses
 * acme@example.test (seeded as APPROVED).
 */
test("an APPROVED company can publish a job posting", async ({ page }) => {
  const uniqueTitle = `E2E Approved ${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  await signInAs(page, "acme@example.test", PASSWORD);
  await page.goto("/company/jobs/new");

  await page.getByLabel(/^Title/).fill(uniqueTitle);
  await page
    .getByLabel(/^Description/)
    .fill("Approved-company posting created in an e2e test.");
  await page.getByRole("button", { name: /^Publish$/ }).click();

  await expect(page).toHaveURL(/\/company\/jobs$/);
  const row = page.locator("tr").filter({ hasText: uniqueTitle });
  await expect(row).toBeVisible();
  await expect(row.getByText("PUBLISHED", { exact: true })).toBeVisible();

  // Cleanup.
  await row.getByRole("button", { name: /^Delete / }).click();
});

/**
 * Cross-role rejection on the new /company/jobs route.
 */
test("a STUDENT cannot reach /company/jobs", async ({ page }) => {
  await signInAs(page, "student01@example.test", PASSWORD);
  await page.goto("/company/jobs");
  await expect(page).toHaveURL(/\/$/);
});

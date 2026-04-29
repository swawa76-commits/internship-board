import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers/sign-in";

const PASSWORD = "Password123!";

/**
 * Full new-company onboarding journey:
 *   sign up COMPANY → routed to /company/onboarding → into profile form
 *   → fill all required fields → first complete save redirects to
 *   /company/dashboard → approval banner is visible there.
 *
 * Uses a unique email per run so the test is independent of seeded
 * fixtures and idempotent.
 */
test("a new company can sign up, complete the profile, and reach the dashboard", async ({
  page,
}) => {
  const email = `e2e-co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = "Password123!";

  // Signup → /company/onboarding (we pick the COMPANY radio).
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel(/^Company$/).check();
  await Promise.all([
    page.waitForURL(/\/company\/onboarding$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);

  // A brand-new company has no profile row yet, so the onboarding
  // welcome panel doesn't show an approval banner — that appears once
  // the first save creates the row at the schema-default PENDING state.
  await expect(
    page.getByRole("heading", {
      name: /Welcome! Let's set up your company profile/i,
    }),
  ).toBeVisible();

  // Hand off to the profile form.
  await page.getByRole("link", { name: /(start|resume) profile/i }).click();
  await expect(page).toHaveURL(/\/company\/profile$/);

  // Fill all required fields.
  await page.getByLabel(/^Company name/).fill("E2E Test Company");
  await page.getByLabel(/^Industry/).fill("Software");
  await page.getByLabel(/^Company size/).selectOption("11-50");
  await page.getByLabel(/^Headquarters/).fill("Remote");
  await page
    .getByLabel(/^Short description/)
    .fill("A small team built for end-to-end test runs.");
  await page
    .getByLabel(/^Full description/)
    .fill(
      "We are a fictional company that exists to make Playwright happy. We never miss a build.",
    );
  await page.getByLabel(/^Contact email/).fill("hr@e2e.test");
  await page.getByRole("button", { name: /save changes/i }).click();

  // First complete save routes to the dashboard.
  await page.waitForURL(/\/company\/dashboard$/, { timeout: 30_000 });

  // Dashboard renders with the approval banner.
  await expect(
    page.getByRole("heading", { name: /Company dashboard/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/Approval status: Pending review/i),
  ).toBeVisible();

  // Direct visit to /company/onboarding now bounces to dashboard
  // because the profile is complete.
  await page.goto("/company/onboarding");
  await expect(page).toHaveURL(/\/company\/dashboard$/);
});

/**
 * Cross-role rejection on the new /company/profile route.
 */
test("a STUDENT cannot reach /company/profile", async ({ page }) => {
  await signInAs(page, "student01@example.test", PASSWORD);
  await page.goto("/company/profile");
  // Proxy redirects mismatched roles to /.
  await expect(page).toHaveURL(/\/$/);
});

/**
 * Editing keeps approvalStatus untouched. We sign in as the seeded
 * APPROVED company, save the profile (no field changes), and check the
 * dashboard still shows Approved.
 */
test("editing the profile does not change a seeded APPROVED company's approvalStatus", async ({
  page,
}) => {
  await signInAs(page, "acme@example.test", PASSWORD);
  await page.goto("/company/profile");
  await expect(page.getByText(/Approval status: Approved/)).toBeVisible();

  // Trigger a save by re-submitting the form unchanged.
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText(/Profile saved/)).toBeVisible();

  // Approval banner still says Approved.
  await expect(page.getByText(/Approval status: Approved/)).toBeVisible();
});

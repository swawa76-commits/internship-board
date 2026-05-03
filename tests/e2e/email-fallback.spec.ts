import { expect, test } from "@playwright/test";

import { uniqueEmail, E2E_PASSWORD } from "./helpers/setup";

/**
 * Email fallback validation.
 *
 * The dev server runs with EMAIL_DRIVER unset → ConsoleEmailAdapter
 * is selected by default. dispatchEmail wraps every send in a
 * try/catch, so even an exploding adapter wouldn't fail the primary
 * mutation (proven by tests/integration/email-dispatch.test.ts via
 * the test seam).
 *
 * At the E2E layer we prove the user-visible promise: signup +
 * profile creation succeeds end-to-end without a real provider
 * configured. If email dispatch were holding the request open or
 * rolling back the user create, signup would either time out or
 * leave the user stuck on /login.
 */
test("student signup completes successfully under the default email fallback", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("fallback");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/student\/onboarding$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /build your student profile/i }),
  ).toBeVisible();
});

test("company signup completes successfully under the default email fallback", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("fallback-co");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByLabel(/company/i).check();
  await Promise.all([
    page.waitForURL(/\/company\/onboarding$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /set up your company profile/i }),
  ).toBeVisible();
});

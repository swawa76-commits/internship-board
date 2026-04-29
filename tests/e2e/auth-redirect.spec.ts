import { expect, test } from "@playwright/test";

test("unauthenticated visitor is bounced from /student/dashboard to login", async ({
  page,
}) => {
  const res = await page.goto("/student/dashboard");
  // Auth.js redirects to its configured signIn page (/login) when the
  // proxy's `authorized` callback returns false.
  await expect(page).toHaveURL(/\/login/);
  expect(res?.ok()).toBeTruthy();
});

test("unauthenticated visitor is bounced from /admin to login", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated visitor is bounced from /company/dashboard to login", async ({
  page,
}) => {
  await page.goto("/company/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

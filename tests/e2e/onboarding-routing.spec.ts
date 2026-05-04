import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers/sign-in";

const PASSWORD = "Password123!";

test.describe("Role-based landing after login", () => {
  test("admin lands on /admin", async ({ page }) => {
    await signInAs(page, "admin@example.test", PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("complete student lands on /student/dashboard", async ({ page }) => {
    await signInAs(page, "student01@example.test", PASSWORD);
    await expect(page).toHaveURL(/\/student\/dashboard$/);
  });

  test("incomplete student lands on /student/onboarding", async ({ page }) => {
    // student08 is seeded with isProfileComplete = false.
    await signInAs(page, "student08@example.test", PASSWORD);
    await expect(page).toHaveURL(/\/student\/onboarding$/);
  });

  test("APPROVED company lands on /company/dashboard with approval banner", async ({
    page,
  }) => {
    await signInAs(page, "acme@example.test", PASSWORD);
    await expect(page).toHaveURL(/\/company\/dashboard$/);
    await expect(page.getByText(/Approval status/i)).toBeVisible();
    await expect(page.getByText(/Approved/)).toBeVisible();
  });

  test("PENDING company lands on /company/dashboard with pending banner", async ({
    page,
  }) => {
    await signInAs(page, "globex@example.test", PASSWORD);
    await expect(page).toHaveURL(/\/company\/dashboard$/);
    await expect(page.getByText(/Pending review/i)).toBeVisible();
  });

  test("SUSPENDED company lands on /company/dashboard with suspended banner", async ({
    page,
  }) => {
    await signInAs(page, "initech@example.test", PASSWORD);
    await expect(page).toHaveURL(/\/company\/dashboard$/);
    await expect(page.getByText(/Approval status: Suspended/i)).toBeVisible();
  });
});

test.describe("Cross-role rejection", () => {
  test("a STUDENT trying to access /admin is redirected away", async ({
    page,
  }) => {
    await signInAs(page, "student01@example.test", PASSWORD);
    await page.goto("/admin");
    // The proxy `authorized` callback redirects mismatched roles to /.
    await expect(page).toHaveURL(/\/$/);
  });

  test("a COMPANY trying to access /student/dashboard is redirected away", async ({
    page,
  }) => {
    await signInAs(page, "acme@example.test", PASSWORD);
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/$/);
  });

  test("a STUDENT trying to access /company/dashboard is redirected away", async ({
    page,
  }) => {
    await signInAs(page, "student01@example.test", PASSWORD);
    await page.goto("/company/dashboard");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("Onboarding self-redirects", () => {
  test("a complete student visiting /student/onboarding is bounced to dashboard", async ({
    page,
  }) => {
    await signInAs(page, "student01@example.test", PASSWORD);
    await page.goto("/student/onboarding");
    await expect(page).toHaveURL(/\/student\/dashboard$/);
  });

  test("an incomplete student visiting /student/dashboard is bounced to onboarding", async ({
    page,
  }) => {
    await signInAs(page, "student08@example.test", PASSWORD);
    // signInAs already redirected to onboarding; verify direct hit too.
    await page.goto("/student/dashboard");
    await expect(page).toHaveURL(/\/student\/onboarding$/);
    await expect(
      page.getByRole("heading", {
        name: /Welcome! Let's build your student profile/i,
      }),
    ).toBeVisible();
  });

  test("a fully-onboarded company visiting /company/onboarding is bounced to dashboard", async ({
    page,
  }) => {
    await signInAs(page, "acme@example.test", PASSWORD);
    await page.goto("/company/onboarding");
    await expect(page).toHaveURL(/\/company\/dashboard$/);
  });
});

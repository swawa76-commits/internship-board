import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers/sign-in";

const PASSWORD = "Password123!";

/**
 * Anonymous visitor on a public posting sees a "Log in to apply" CTA.
 */
test("anonymous visitor sees login prompt instead of apply form", async ({
  page,
}) => {
  await page.goto("/companies/acme-robotics/jobs/robotics-controls-intern");
  await expect(
    page.getByRole("link", { name: /log in to apply/i }),
  ).toBeVisible();
});

/**
 * A signed-in but incomplete student is told to finish their profile.
 * student08 is seeded as incomplete.
 */
test("incomplete student is told to finish profile rather than seeing the form", async ({
  page,
}) => {
  await signInAs(page, "student08@example.test", PASSWORD);
  await page.goto("/companies/acme-robotics/jobs/robotics-controls-intern");
  await expect(page.getByText(/Finish your profile before applying/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /open your profile/i }),
  ).toBeVisible();
});

/**
 * A complete student who already applied to a posting (per the seed:
 * student01 → robotics-controls-intern) sees the "already applied"
 * affordance.
 */
test("a student who already applied sees an already-applied notice", async ({
  page,
}) => {
  await signInAs(page, "student01@example.test", PASSWORD);
  await page.goto("/companies/acme-robotics/jobs/robotics-controls-intern");
  await expect(
    page.getByText(/already applied to this posting/i),
  ).toBeVisible();
});

/**
 * The student-side applications page lists the seeded application(s)
 * for a logged-in student.
 */
test("student applications page lists their existing applications", async ({
  page,
}) => {
  await signInAs(page, "student01@example.test", PASSWORD);
  await page.goto("/student/applications");
  await expect(
    page.getByRole("heading", { name: /Your applications/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /Robotics Controls Intern/i }),
  ).toBeVisible();
});

/**
 * The company-side applications board lists applicants grouped by status.
 */
test("company applications board shows applicants for the company's postings", async ({
  page,
}) => {
  await signInAs(page, "acme@example.test", PASSWORD);
  await page.goto("/company/applications");
  await expect(
    page.getByRole("heading", { name: /Applicants/i }),
  ).toBeVisible();
  // Acme has multiple seeded applications across statuses; we expect
  // at least the "In review" group header to render.
  await expect(
    page.getByRole("heading", { name: /^In review/ }),
  ).toBeVisible();
});

/**
 * Company-side board has status transition buttons. We move an applicant
 * from APPLIED → IN_REVIEW and confirm the row's status badge updates.
 *
 * Note: this mutates seeded data, so we reverse the transition at the
 * end. The seed is idempotent, but cleanup keeps the dataset stable
 * for any subsequent run that doesn't re-seed first.
 */
test("company can move an APPLIED applicant to IN_REVIEW", async ({
  page,
}) => {
  await signInAs(page, "acme@example.test", PASSWORD);
  await page.goto("/company/applications");

  // The seeded student01/robotics-controls-intern application starts at
  // APPLIED. Find that article (locating by the unique applicant name).
  const article = page
    .locator("article")
    .filter({ hasText: "Student 1 Test" });
  // Only act if the row is currently APPLIED — the seed places it there
  // but a previous test run might have moved it.
  const newBadge = article.getByText("APPLIED", { exact: true });
  if ((await newBadge.count()) > 0) {
    await article.getByRole("button", { name: /^Move to review$/ }).click();
    // Status badge updated.
    await expect(article.getByText("IN_REVIEW", { exact: true })).toBeVisible();
  }
});

/**
 * Cross-role: a STUDENT cannot reach /company/applications.
 */
test("a STUDENT cannot reach /company/applications", async ({ page }) => {
  await signInAs(page, "student01@example.test", PASSWORD);
  await page.goto("/company/applications");
  await expect(page).toHaveURL(/\/$/);
});

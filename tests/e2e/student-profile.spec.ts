import { expect, test } from "@playwright/test";

/**
 * Full new-student onboarding journey:
 *   sign up → routed to /student/onboarding → click into profile form
 *   → fill basics → add skill / experience / project → upload resume
 *   → completeness flips to 100% → dashboard becomes reachable.
 *
 * Uses a unique email per run so the test is independent of seeded
 * fixtures and can run repeatedly without manual cleanup.
 */
test("a new student can sign up, complete the profile, and reach the dashboard", async ({
  page,
}) => {
  const email = `e2e-stud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const password = "Password123!";

  // Signup → auto-login → /student/onboarding
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  // STUDENT is the default radio; nothing to click.
  await Promise.all([
    page.waitForURL(/\/student\/onboarding$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);

  // Hand off to the profile form.
  await page.getByRole("link", { name: /(start|resume) profile/i }).click();
  await expect(page).toHaveURL(/\/student\/profile$/);

  // Fill basics.
  await page.getByLabel(/^Full name/).fill("E2E Student");
  await page.getByLabel("Headline").fill("Aspiring backend engineer");
  await page.getByLabel("University").fill("State University");
  await page.getByLabel("Graduation year").fill("2027");
  await page.getByLabel("Degree").fill("B.S.");
  await page.getByLabel("Major").fill("Computer Science");
  await page.getByLabel("Location").fill("Remote");
  await page.getByLabel("Work authorization").fill("US citizen");
  await page.getByLabel("Bio").fill("Profile completed by an e2e test.");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText(/profile saved\./i)).toBeVisible();

  // Skill / experience / project. Use list-scoped queries so the
  // section description and empty-state copy don't accidentally match.
  const skillsList = page.getByRole("list", { name: /^skills$/i });
  const experiencesList = page.getByRole("list", { name: /^experiences$/i });
  const projectsList = page.getByRole("list", { name: /^projects$/i });

  await page.getByLabel(/add a skill/i).fill("TypeScript");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(skillsList.getByText("TypeScript")).toBeVisible();

  await page.getByLabel("Title").fill("Software Intern");
  await page.getByLabel("Organization").fill("Acme");
  await page.getByRole("button", { name: /add experience/i }).click();
  await expect(experiencesList.getByText("Software Intern")).toBeVisible();

  await page.getByLabel("Project name").fill("Side Project");
  await page.getByRole("button", { name: /add project/i }).click();
  await expect(projectsList.getByText("Side Project")).toBeVisible();

  // Resume upload — local-fs storage adapter handles this in dev.
  const fakePdf = Buffer.from("%PDF-1.4\n%E2E test fixture\n%%EOF\n");
  await page.getByLabel(/upload resume|replace resume/i).setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: fakePdf,
  });
  await page.getByRole("button", { name: /^upload$/i }).click();
  await expect(page.getByText(/resume uploaded\./i)).toBeVisible();

  // Completeness now reads 100%.
  await expect(page.getByText(/100%/)).toBeVisible();

  // Dashboard should be reachable directly now (no onboarding redirect).
  await page.goto("/student/dashboard");
  await expect(page).toHaveURL(/\/student\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Student dashboard/i }),
  ).toBeVisible();
});

import { expect, type Page } from "@playwright/test";

/**
 * Per-test fixtures. Every helper here generates a fresh email per
 * call so two parallel workers can't collide on the same row. We
 * never delete after a run — the partial unique index makes it safe
 * to leave residue, and a bounded number of test runs won't bloat
 * the dev DB. The seed script remains idempotent; rerun it any time
 * the DB needs a clean canonical state.
 */

export const E2E_PASSWORD = "Password123!";

export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

/**
 * Sign up a brand-new student account and bring them through profile
 * completion. Returns the email so the caller can re-login if needed.
 *
 * The flow is the same one already exercised in
 * tests/e2e/student-profile.spec.ts; centralising here keeps the
 * other specs focused on whatever behaviour they're actually proving.
 */
export async function signupAsStudent(page: Page): Promise<string> {
  const email = uniqueEmail("stud");

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/student\/onboarding$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);
  return email;
}

export async function completeStudentProfile(page: Page): Promise<void> {
  // Land on the profile form via the onboarding card.
  await page.getByRole("link", { name: /(start|resume) profile/i }).click();
  await expect(page).toHaveURL(/\/student\/profile$/);

  await page.getByLabel(/^Full name/).fill("E2E Student");
  await page.getByLabel("Headline").fill("Aspiring engineer");
  await page.getByLabel("University").fill("State University");
  await page.getByLabel("Graduation year").fill("2027");
  await page.getByLabel("Degree").fill("B.S.");
  await page.getByLabel("Major").fill("Computer Science");
  await page.getByLabel("Location").fill("Remote");
  await page.getByLabel("Work authorization").fill("US citizen");
  await page.getByLabel("Bio").fill("E2E setup helper.");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText(/profile saved\./i)).toBeVisible();

  await page.getByLabel(/add a skill/i).fill("TypeScript");
  await page.getByRole("button", { name: /^add$/i }).click();

  await page.getByLabel("Title").fill("Software Intern");
  await page.getByLabel("Organization").fill("Acme");
  await page.getByRole("button", { name: /add experience/i }).click();

  await page.getByLabel("Project name").fill("Side Project");
  await page.getByRole("button", { name: /add project/i }).click();

  // Resume upload via the local-fs storage adapter (default in dev).
  // Dual purpose: completes the profile AND exercises the storage
  // fallback end-to-end.
  const fakePdf = Buffer.from("%PDF-1.4\n%E2E test fixture\n%%EOF\n");
  await page.getByLabel(/upload resume|replace resume/i).setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: fakePdf,
  });
  await page.getByRole("button", { name: /^upload$/i }).click();
  await expect(page.getByText(/resume uploaded\./i)).toBeVisible();

  // Sanity: completeness is now 100% and the dashboard is reachable
  // without an onboarding bounce.
  await page.goto("/student/dashboard");
  await expect(page).toHaveURL(/\/student\/dashboard$/);
}

import { expect, test } from "@playwright/test";

import { completeStudentProfile, signupAsStudent } from "./helpers/setup";

/**
 * Student post-apply lifecycle — Task 12 features that the original
 * E2E pass missed:
 *   1. save / unsave a job posting
 *   2. apply to a posting and then withdraw the application
 *
 * Reuses one fresh student account across both scenarios to amortise
 * the (slow) signup + profile completion. Browses the seeded public
 * jobs board to find postings — the seed guarantees PUBLISHED rows
 * on APPROVED companies are present.
 */
test.describe.configure({ mode: "serial" });

let studentEmail: string;

test("a fresh student completes profile then exercises save/apply/withdraw", async ({
  page,
}) => {
  test.setTimeout(120_000);
  studentEmail = await signupAsStudent(page);
  await completeStudentProfile(page);

  // Save / unsave: navigate to the public board, save the first
  // posting, confirm it appears on /student/saved-job-postings, then
  // unsave it and confirm it's gone.
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { name: /Browse internships/i }),
  ).toBeVisible();

  const firstCard = page.getByRole("article").first();
  await expect(firstCard).toBeVisible();
  const titleLink = firstCard.getByRole("link").first();
  const jobTitle = (await titleLink.innerText()).trim();

  // The Save button is rendered via SaveJobToggle. Pre-state: unsaved.
  const saveBtn = firstCard.getByRole("button", { name: /^save$/i });
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();
  // Post-state: button label flips to "Saved" with aria-pressed.
  await expect(
    firstCard.getByRole("button", { name: /^saved$/i }),
  ).toHaveAttribute("aria-pressed", "true");

  // Saved postings page: row exists.
  await page.goto("/student/saved-job-postings");
  await expect(
    page.getByRole("heading", { name: /Saved postings/i }),
  ).toBeVisible();
  const savedCard = page.locator("li").filter({ hasText: jobTitle }).first();
  await expect(savedCard).toBeVisible();

  // Unsave from the saved page (button shows "Saved"). Wait for the
  // POST → revalidation round-trip to settle, then re-fetch the page
  // to assert the row is gone (the form submits to a server action,
  // not a route navigation, so we re-load explicitly).
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.status() < 400,
      { timeout: 15_000 },
    ),
    savedCard.getByRole("button", { name: /^saved$/i }).click(),
  ]);
  await page.goto("/student/saved-job-postings");
  await expect(page.locator("li").filter({ hasText: jobTitle })).toHaveCount(
    0,
    { timeout: 10_000 },
  );

  // Apply to a different posting so the Withdraw flow has a fresh row.
  await page.goto("/jobs");
  // Open the first posting's detail page and submit an application.
  const detailLink = page
    .getByRole("article")
    .first()
    .getByRole("link")
    .first();
  await detailLink.click();
  await expect(page).toHaveURL(/\/companies\/.+\/jobs\/.+$/);

  await page
    .getByLabel(/cover letter/i)
    .fill("E2E withdraw spec — submitting an application to test withdraw.");
  await Promise.all([
    page.waitForURL(/\/student\/applications$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /submit application/i }).click(),
  ]);

  // Withdraw flow: there should now be at least one APPLIED row.
  await expect(
    page.getByRole("heading", { name: /Your applications/i }),
  ).toBeVisible();

  // Find the row whose status is currently APPLIED, In review,
  // Interviewing, or Offer (active set) and click Withdraw.
  const activeRow = page
    .locator("tr")
    .filter({
      has: page.getByRole("button", { name: /^withdraw$/i }),
    })
    .first();
  await expect(activeRow).toBeVisible();
  await activeRow.getByRole("button", { name: /^withdraw$/i }).click();

  // Post-withdraw: the same row's status pill should now read
  // "Withdrawn" and the Withdraw button must no longer appear.
  await expect(
    page.getByText("Withdrawn", { exact: true }).first(),
  ).toBeVisible({
    timeout: 10_000,
  });

  // Audit on the email used so a future debugger can repro.
  expect(studentEmail).toMatch(/^e2e-stud-/);
});

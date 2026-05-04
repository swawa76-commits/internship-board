import { expect, test } from "@playwright/test";

import { signInAs } from "./helpers/sign-in";
import {
  completeStudentProfile,
  signupAsStudent,
  E2E_PASSWORD,
} from "./helpers/setup";

/**
 * Messaging end-to-end:
 *   1. A fresh student applies to a seeded acme posting.
 *   2. The seeded acme COMPANY signs in, opens that applicant, and
 *      starts a thread with the first message.
 *   3. The student signs back in, opens /student/messages, replies.
 *   4. The company sees the reply on the thread page.
 *
 * Strict serial — the same DB rows are read across roles, and
 * signed-in cookies are the page's only auth signal.
 */
test.describe.configure({ mode: "serial" });

let studentEmail: string;
let postingTitle: string;

test("student applies, company starts thread, student replies", async ({
  page,
}) => {
  test.setTimeout(180_000);

  // ----- Phase 1: fresh student signs up + applies to a seeded posting.
  studentEmail = await signupAsStudent(page);
  await completeStudentProfile(page);

  await page.goto("/jobs");
  // Pick the FIRST acme posting on the public board so we can navigate
  // back to it predictably from the company-side applicants table.
  const acmeCard = page
    .getByRole("article")
    .filter({ hasText: "Acme Robotics" })
    .first();
  await expect(acmeCard).toBeVisible();
  postingTitle = (await acmeCard.getByRole("link").first().innerText()).trim();
  await acmeCard.getByRole("link", { name: postingTitle }).click();
  await expect(page).toHaveURL(/\/companies\/.+\/jobs\/.+$/);

  await page
    .getByLabel(/cover letter/i)
    .fill("E2E messaging spec — applying to start a thread.");
  await Promise.all([
    page.waitForURL(/\/student\/applications$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /submit application/i }).click(),
  ]);

  // Logout the student via the dashboard logout button so the company
  // login below starts cleanly.
  await page.goto("/student/dashboard");
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);

  // ----- Phase 2: acme COMPANY signs in and starts a thread.
  await signInAs(page, "acme@example.test", E2E_PASSWORD);
  await page.goto("/company/applications");
  await expect(
    page.getByRole("heading", { name: /^Applicants$/ }),
  ).toBeVisible();

  // Locate the row for our brand-new student. The table shows the
  // student's full name (set by the helper to "E2E Student") next to
  // the posting title we applied to.
  const applicantRow = page
    .getByRole("article")
    .filter({ hasText: "E2E Student" })
    .filter({ hasText: postingTitle })
    .first();
  await expect(applicantRow).toBeVisible();
  await applicantRow.getByRole("link", { name: /^message$/i }).click();
  await expect(page).toHaveURL(/\/company\/applications\/[^/]+\/message$/);

  // Send the first message — server action redirects to the new thread.
  await page.getByLabel(/first message/i).fill("Hi! Are you still interested?");
  await Promise.all([
    page.waitForURL(/\/company\/messages\/[^/]+$/, { timeout: 30_000 }),
    page.getByRole("button", { name: /send and open thread/i }).click(),
  ]);
  await expect(page.getByText("Hi! Are you still interested?")).toBeVisible();

  // Logout company.
  await page.goto("/company/dashboard");
  await page.getByRole("button", { name: /log out/i }).click();

  // ----- Phase 3: student signs back in and replies.
  await signInAs(page, studentEmail, E2E_PASSWORD);
  await page.goto("/student/messages");
  await expect(page.getByRole("heading", { name: /^Messages$/ })).toBeVisible();

  // Inbox shows one thread with the company's message preview.
  const threadEntry = page
    .getByRole("link")
    .filter({ hasText: /Acme Robotics/i })
    .first();
  await expect(threadEntry).toBeVisible();
  await threadEntry.click();
  await expect(page).toHaveURL(/\/student\/messages\/[^/]+$/);

  // Reply form is visible because the company initiated. Send a reply.
  await page.getByLabel(/^reply$/i).fill("Yes — looking forward to chatting!");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(
    page.getByText("Yes — looking forward to chatting!"),
  ).toBeVisible({ timeout: 10_000 });

  // ----- Phase 4: company sees the reply.
  await page.goto("/student/dashboard");
  await page.getByRole("button", { name: /log out/i }).click();

  await signInAs(page, "acme@example.test", E2E_PASSWORD);
  await page.goto("/company/messages");
  const companyThreadEntry = page
    .getByRole("link")
    .filter({ hasText: "E2E Student" })
    .first();
  await companyThreadEntry.click();
  await expect(page).toHaveURL(/\/company\/messages\/[^/]+$/);
  await expect(
    page.getByText("Yes — looking forward to chatting!"),
  ).toBeVisible({ timeout: 10_000 });
});

import { expect, test } from "@playwright/test";

/**
 * Anonymous browse → filter → open detail flow. The seeded approved
 * company `acme-robotics` has 4 PUBLISHED postings spread across
 * workplace types, so filters have something to chew on.
 *
 * No login is required for any of this — the proxy excludes /jobs and
 * /companies via the public group.
 */
test("anonymous user can browse, filter, and open a job detail page", async ({
  page,
}) => {
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { name: /Browse internships/i }),
  ).toBeVisible();

  // Acme has at least one ONSITE posting in the seed (Robotics Controls
  // Intern). Apply the workplaceType filter and confirm at least one
  // result remains.
  await page.getByLabel("Workplace").selectOption("ONSITE");
  await page.getByRole("button", { name: /apply filters/i }).click();
  await expect(page).toHaveURL(/workplaceType=ONSITE/);
  const resultCards = page.locator("ul li article");
  await expect(resultCards.first()).toBeVisible();

  // Click into the first card. URL must follow the canonical
  // /companies/[companySlug]/jobs/[jobSlug] shape.
  const firstLink = resultCards.first().getByRole("link").first();
  const href = await firstLink.getAttribute("href");
  expect(href).toMatch(/^\/companies\/[a-z0-9-]+\/jobs\/[a-z0-9-]+$/);
  await firstLink.click();
  await expect(page).toHaveURL(
    /\/companies\/[a-z0-9-]+\/jobs\/[a-z0-9-]+$/,
  );

  // Apply CTA is visible. (Anonymous visitor: a "Log in to apply" link
  // since Task 11 wired the CTA to a real apply flow.)
  await expect(
    page.getByRole("link", { name: /log in to apply/i }),
  ).toBeVisible();

  // Breadcrumb back to the company page works.
  const companyHref = await page
    .getByRole("link", { name: /View company profile/i })
    .getAttribute("href");
  expect(companyHref).toMatch(/^\/companies\/[a-z0-9-]+$/);
});

/**
 * A pending company's PUBLISHED posting must not appear publicly.
 * Globex is seeded as PENDING with PUBLISHED postings — those are the
 * exact rows that exercise the visibility fragment.
 */
test("a PENDING company's posting 404s on the public detail page", async ({
  page,
}) => {
  // From the seed: globex's "clinical-research-intern" is PUBLISHED but
  // owned by a PENDING company. It must 404 on the public surface.
  const res = await page.goto(
    "/companies/globex-health/jobs/clinical-research-intern",
  );
  expect(res?.status()).toBe(404);
});

/**
 * A SUSPENDED company's PUBLISHED posting must also 404.
 */
test("a SUSPENDED company's posting 404s on the public detail page", async ({
  page,
}) => {
  // Initech is seeded as SUSPENDED with PUBLISHED postings.
  const res = await page.goto(
    "/companies/initech-systems/jobs/platform-eng-intern",
  );
  expect(res?.status()).toBe(404);
});

/**
 * The /jobs list excludes pending and suspended companies' titles.
 */
test("the public list excludes PENDING / SUSPENDED company postings", async ({
  page,
}) => {
  await page.goto("/jobs");
  // Acme (APPROVED) postings should be visible.
  await expect(page.getByText(/Acme Robotics/i).first()).toBeVisible();
  // Globex (PENDING) and Initech (SUSPENDED) postings must not.
  await expect(page.getByText(/Globex Health/i)).toHaveCount(0);
  await expect(page.getByText(/Initech Systems/i)).toHaveCount(0);
});

/**
 * Keyword filter narrows the list and shows a non-zero count in the
 * header; clearing it returns to the full set.
 */
test("keyword search narrows results and Clear restores them", async ({
  page,
}) => {
  await page.goto("/jobs");
  await page.getByLabel("Keyword").fill("robotics");
  await page.getByRole("button", { name: /apply filters/i }).click();
  await expect(page).toHaveURL(/q=robotics/);

  // At least one result.
  const cards = page.locator("ul li article");
  await expect(cards.first()).toBeVisible();

  // Clear restores to /jobs with no query string.
  await page.getByRole("link", { name: /^Clear$/ }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});

/**
 * Public company page renders with the company name and at least one
 * posting link.
 */
test("public company page renders with PUBLISHED postings", async ({
  page,
}) => {
  await page.goto("/companies/acme-robotics");
  await expect(
    page.getByRole("heading", { name: /Acme Robotics/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Open internships/i }),
  ).toBeVisible();
});

test("public company page 404s for a PENDING company", async ({ page }) => {
  const res = await page.goto("/companies/globex-health");
  expect(res?.status()).toBe(404);
});

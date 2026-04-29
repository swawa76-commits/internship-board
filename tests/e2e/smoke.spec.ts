import { expect, test } from "@playwright/test";

test("home page loads with marketing copy", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Connect students with internship opportunities/i,
    }),
  ).toBeVisible();
});

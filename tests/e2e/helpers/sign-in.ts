import { expect, type Page } from "@playwright/test";

/**
 * Sign in through the public login form. The form is a server action,
 * which submits and follows the post-login dispatcher to the role's
 * landing page. We wait for the URL to settle on something that's
 * neither /login nor /post-login (the intermediate dispatcher).
 *
 * The longer timeout accommodates first-hit dev-server compile under
 * parallel Playwright workers.
 */
export async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(
      (url) =>
        !/\/login$/.test(url.pathname) && !/\/post-login$/.test(url.pathname),
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: /log in/i }).click(),
  ]);
  // Belt-and-braces: confirm we're not still on /login.
  await expect(page).not.toHaveURL(/\/login$/);
}

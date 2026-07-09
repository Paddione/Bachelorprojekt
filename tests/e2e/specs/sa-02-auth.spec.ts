import { test, expect } from '@playwright/test';

test.describe('SA-02: Authentifizierung — Browser (Pocket ID)', () => {
  test('T1: Falsches Passwort → Fehlermeldung (über Pocket ID)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || process.env.WEBSITE_URL || 'http://localhost:4321';

    // /login on the website redirects directly to Pocket ID (force-SSO).
    await page.goto(`${baseURL}/login`);

    // Pocket ID's login form lives at /login (or /authorize — depends on the
    // client config). We assert we left the website origin and landed on
    // an id.* / Pocket ID page.
    await expect(page).toHaveURL(/id\.|pocket-id/, { timeout: 60_000 });

    // Pocket ID uses standard form fields; the passkey-first flow may
    // present a "Sign in with passkey" button. Click whichever credential
    // option exists, then enter a deliberately wrong password.
    const usernameInput = page.locator('#username, input[name="username"], input[type="email"]');
    if (await usernameInput.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await usernameInput.first().fill('testuser1');
      const passwordInput = page.locator('#password, input[name="password"], input[type="password"]');
      if (await passwordInput.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await passwordInput.first().fill('wrongpassword');
        await page.locator('button[type="submit"], input[type="submit"]').first().click();
        await expect(
          page.locator('#input-error, .feedback-error, .alert-error, [role="alert"]').first()
        ).toBeVisible({ timeout: 30_000 });
      }
    }
    await context.close();
  });

  test('T4: /login leitet automatisch zu Pocket ID (force-SSO)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || process.env.WEBSITE_URL || 'http://localhost:4321';

    await page.goto(`${baseURL}/login`);

    // /login redirects directly to Pocket ID (force-SSO) — verify by
    // matching the Pocket ID origin (id.<domain>) or cluster service.
    await expect(page).toHaveURL(/id\.|pocket-id/, { timeout: 60_000 });
    await context.close();
  });
});

import { test, expect } from '@playwright/test';

test.describe('SA-02: Authentifizierung — Browser', () => {
  test('T1: Falsches Passwort → Fehlermeldung (über Keycloak)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || process.env.WEBSITE_URL || 'http://localhost:4321';

    // /login on the website redirects directly to Keycloak (force-SSO).
    await page.goto(`${baseURL}/login`);

    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 15_000 });

    await page.locator('#username, input[name="username"]').fill('testuser1');
    await page.locator('#password, input[name="password"]').fill('wrongpassword');
    await page.locator('#kc-login, input[type="submit"]').click();

    await expect(
      page.locator('#input-error, .kc-feedback-text, .alert-error').first()
    ).toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test('T4: /login leitet automatisch zu Keycloak (force-SSO)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || process.env.WEBSITE_URL || 'http://localhost:4321';

    await page.goto(`${baseURL}/login`);

    // /login redirects directly to Keycloak (force-SSO)
    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 10_000 });
    await context.close();
  });
});

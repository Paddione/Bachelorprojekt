import { test, expect } from '@playwright/test';

test.describe('SA-02: Authentifizierung — Browser', () => {
  test('T1: Falsches Passwort → Fehlermeldung', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8065';

    await page.goto(`${baseURL}/login`);
    await page.getByPlaceholder(/email/i).fill('testuser1');
    await page.getByPlaceholder(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|anmelden|log in/i }).click();

    await expect(
      page.locator('.login-body-message-error, .AlertBanner, [class*="error"]')
    ).toBeVisible({ timeout: 5_000 });
    await context.close();
  });

  test('T4: SSO-Login Button sichtbar', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8065';

    await page.goto(`${baseURL}/login`);

    const ssoBtn = page.getByRole('button', { name: /keycloak|openid|sso/i });
    await expect(ssoBtn).toBeVisible({ timeout: 10_000 });
    await context.close();
  });
});

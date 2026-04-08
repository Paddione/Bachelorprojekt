import { test, expect } from '@playwright/test';

const VAULT_URL = process.env.VAULT_URL || 'http://vault.localhost';

test.describe('FA-23: Vaultwarden Passwort-Manager', () => {

  test('T1: Vaultwarden login page loads', async ({ page }) => {
    const res = await page.goto(VAULT_URL);
    expect(res?.status()).toBe(200);
  });

  test('T2: Login page has email input', async ({ page }) => {
    await page.goto(VAULT_URL);
    // Vaultwarden web vault shows email input on login
    await expect(page.locator('input[type="email"], input[name="email"], #login_input_email')).toBeVisible({ timeout: 10_000 });
  });

  test('T3: SSO login button visible', async ({ page }) => {
    await page.goto(VAULT_URL);
    // When SSO is enabled, Vaultwarden shows an SSO login option
    const ssoButton = page.locator('button:has-text("SSO"), a:has-text("SSO"), button:has-text("Enterprise"), [data-testid="sso"]');
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });
  });

  test('T4: /alive health endpoint returns 200', async ({ page }) => {
    const res = await page.goto(`${VAULT_URL}/alive`);
    expect(res?.status()).toBe(200);
  });
});

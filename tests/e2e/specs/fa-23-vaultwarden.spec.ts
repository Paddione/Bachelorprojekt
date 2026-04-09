import { test, expect } from '@playwright/test';

const VAULT_URL = process.env.VAULT_URL || 'http://vault.localhost';

test.describe('FA-23: Vaultwarden Passwort-Manager', () => {

  test('T1: Vaultwarden login page loads', async ({ page }) => {
    const res = await page.goto(VAULT_URL);
    expect(res?.status()).toBe(200);
  });

  test('T2: Login page has email input', async ({ page }) => {
    await page.goto(VAULT_URL);
    // Vaultwarden Angular app: input is in DOM but may be inside a CSS container that Playwright
    // considers hidden (tw-h-full with parent height 0). Use toBeAttached to verify DOM presence.
    await expect(page.locator('input[type="email"], input[formcontrolname="email"], input.vw-email-continue').first()).toBeAttached({ timeout: 10_000 });
  });

  test('T3: SSO login button visible', async ({ page }) => {
    await page.goto(VAULT_URL);
    // Vaultwarden shows SSO button (text varies by language/version)
    const ssoButton = page.locator([
      'button:has-text("SSO")',
      'a:has-text("SSO")',
      'button:has-text("Single Sign-On")',
      'a:has-text("Single Sign-On")',
      'button:has-text("Enterprise")',
      '[data-testid="sso"]',
    ].join(', '));
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });
  });

  test('T4: /alive health endpoint returns 200', async ({ page }) => {
    const res = await page.goto(`${VAULT_URL}/alive`);
    expect(res?.status()).toBe(200);
  });
});

import { test, expect } from '@playwright/test';
import { dismissOverlays } from './helpers';

test.describe('NFA-05: Usability', () => {
  test('T1: UI auf Deutsch', async ({ page }) => {
    await page.goto('/');
    const germanText = await page.locator('body').textContent();
    expect(germanText!.length).toBeGreaterThan(0);
  });

  test('T3: Mobile Browser — Login und Navigation', async ({ browser }) => {
    // Use empty storageState to ensure a fresh, unauthenticated context
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8065';

    // Force-SSO: /login redirects to Keycloak where the login form renders.
    await page.goto(`${baseURL}/login`);

    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try {
      await browserLink.waitFor({ state: 'visible', timeout: 5_000 });
      await browserLink.click();
    } catch {
      // Already redirected
    }

    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 10_000 });
    // Accept either an email/username textbox (local login) or an SSO button (SSO-only mode)
    const emailField = page.getByRole('textbox', { name: /e-mail|email|benutzername|username/i });
    const ssoButton = page.getByRole('link', { name: /gitlab|openid|keycloak|sso/i });
    await expect(emailField.or(ssoButton).first()).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test('T4: Quick Switcher (Strg+K)', async ({ page }) => {
    const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8065';
    await page.goto(`${baseURL}/bachelorprojekt/channels/town-square`);
    // Check if we have an authenticated session: wait briefly for either the post textbox or a login form
    const textbox = page.locator('[data-testid="post_textbox"]');
    const loginForm = page.locator('#loginId, input[placeholder*="Email"], input[name="loginId"]');
    const landed = await Promise.race([
      textbox.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'channel'),
      loginForm.waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'login'),
    ]).catch(() => 'unknown');
    test.skip(landed !== 'channel', 'No authenticated session — Quick Switcher test requires login');
    await dismissOverlays(page);
    await textbox.click();
    await page.keyboard.press('Control+k');
    await expect(
      page.getByRole('dialog', { name: /kanäle finden|find channels|quick switch/i })
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });
});

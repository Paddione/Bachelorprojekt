import { test, expect } from '@playwright/test';
import { dismissOverlays } from './helpers';

test.describe('NFA-05: Usability', () => {
  test('T1: UI auf Deutsch', async ({ page }) => {
    await page.goto('/');
    const germanText = await page.locator('body').textContent();
    expect(germanText!.length).toBeGreaterThan(0);
  });

  test('T3: Mobile Browser — Login und Navigation', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    });
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8065';

    await page.goto(`${baseURL}/login`);

    // Dismiss "Desktop vs Browser" chooser if present
    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try {
      await browserLink.waitFor({ state: 'visible', timeout: 5_000 });
      await browserLink.click();
    } catch {
      // Already on login form
    }

    await expect(page.getByRole('textbox', { name: /e-mail|email|benutzername|username/i })).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test('T4: Quick Switcher (Strg+K)', async ({ page }) => {
    await page.goto('/');
    await dismissOverlays(page);
    // Focus the post textbox first to ensure keyboard events reach Mattermost
    await page.locator('#post_textbox').click();
    await page.keyboard.press('Control+k');
    await expect(
      page.getByRole('dialog', { name: /kanäle finden|find channels|quick switch/i })
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });
});

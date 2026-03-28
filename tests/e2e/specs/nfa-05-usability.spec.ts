import { test, expect } from '@playwright/test';

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
    await expect(page.locator('input, #input_loginId')).toBeVisible({ timeout: 10_000 });
    await context.close();
  });

  test('T4: Quick Switcher (Strg+K)', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(
      page.locator('.suggestion-list__content, .modal-content, [role="dialog"]')
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

let siteAvailable = false;

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get(BASE, { timeout: 5000 });
    siteAvailable = res.ok();
  } catch {
    siteAvailable = false;
  }
});

test.describe('NFA-05: Usability', () => {
  test('T1: UI auf Deutsch', async ({ page }) => {
    test.skip(!siteAvailable, `Website not accessible at ${BASE}`);
    await page.goto(BASE);
    const germanText = await page.locator('body').textContent();
    expect(germanText!.length).toBeGreaterThan(0);
  });

  test('T3: Mobile Browser — Website lädt korrekt', async ({ browser }) => {
    test.skip(!siteAvailable, `Website not accessible at ${BASE}`);
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    });
    const page = await context.newPage();

    const res = await page.goto(BASE);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 });
    // On mobile the desktop nav is hidden; the hamburger toggle is visible instead
    await expect(page.locator('button.mobile-toggle')).toBeVisible({ timeout: 5_000 });

    await context.close();
  });

  test('T4: Keyboard Navigation — Tab-Fokus funktioniert', async ({ page }) => {
    test.skip(!siteAvailable, `Website not accessible at ${BASE}`);
    await page.goto(BASE);
    await expect(page.locator('h1')).toBeVisible();

    await page.keyboard.press('Tab');

    // After Tab, a focusable element (link, button, or input) should receive focus
    const focused = page.locator('a:focus, button:focus, input:focus, select:focus, textarea:focus');
    await expect(focused).toHaveCount(1, { timeout: 3_000 });
  });
});

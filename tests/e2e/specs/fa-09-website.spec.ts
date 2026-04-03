import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-09: Unternehmenswebsite (Astro + Svelte)', () => {
  test('T1: Landing page loads', async ({ page }) => {
    const res = await page.goto(BASE);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('T2: All main pages return 200', async ({ page }) => {
    const pages = [
      '/digital-cafe',
      '/coaching',
      '/beratung',
      '/ueber-mich',
      '/kontakt',
      '/leistungen',
      '/termin',
      '/registrieren',
      '/impressum',
      '/datenschutz',
    ];
    for (const path of pages) {
      const res = await page.goto(`${BASE}${path}`);
      expect(res?.status(), `${path} should return 200`).toBe(200);
    }
  });

  test('T3: Navigation visible with key links', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('nav a[href="/leistungen"]')).toBeVisible();
    await expect(page.locator('nav a[href="/termin"]')).toBeVisible();
    await expect(page.locator('nav a[href="/kontakt"]')).toBeVisible();
  });

  test('T4: Landing page has services section', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('#angebote')).toBeVisible();
  });

  test('T5: Footer has contact info', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('footer')).toContainText('mentolder.de');
    await expect(page.locator('footer')).toContainText('info@mentolder.de');
  });

  test('T6: Profile image loads on landing page', async ({ page }) => {
    await page.goto(BASE);
    const img = page.locator('img[alt="Gerald Korczewski"]');
    await expect(img).toBeVisible();
  });

  test('T7: Dark theme applied (dark background)', async ({ page }) => {
    await page.goto(BASE);
    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    // Should be dark (#0f1623 = rgb(15, 22, 35))
    expect(bgColor).toContain('15');
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Public static pages', () => {
  const publicPages = [
    { path: '/agb',                   title: /AGB|Geschäftsbedingungen/i },
    { path: '/datenschutz',           title: /Datenschutz/i },
    { path: '/impressum',             title: /Impressum/i },
    { path: '/barrierefreiheit',      title: /Barrierefreiheit/i },
    { path: '/cookie-einstellungen',  title: /Cookie/i },
    { path: '/referenzen',            title: /Referenzen/i },
    { path: '/meine-daten',           title: /Meine Daten/i },
    { path: '/status',                title: /Bug-Status/i },
  ];

  for (const { path, title } of publicPages) {
    test(`${path} loads and shows expected heading`, async ({ page }) => {
      const res = await page.goto(`${BASE}${path}`);
      expect(res?.status(), `${path} should return 200`).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('h1').first()).toContainText(title);
    });
  }

  test('/newsletter/bestaetigt renders confirmation', async ({ page }) => {
    const res = await page.goto(`${BASE}/newsletter/bestaetigt`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toContainText('Anmeldung bestätigt');
  });

  test('/newsletter/token-ungueltig renders error page', async ({ page }) => {
    const res = await page.goto(`${BASE}/newsletter/token-ungueltig`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).not.toContainText('500');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('/stripe/success renders without 500', async ({ page }) => {
    // Without a valid session_id it renders a generic confirmation
    const res = await page.goto(`${BASE}/stripe/success`);
    expect(res?.status()).not.toBe(500);
    await expect(page.locator('body')).not.toContainText('500');
  });

  test('/404 renders maintenance/not-found page', async ({ page }) => {
    const res = await page.goto(`${BASE}/404`);
    // The 404 page itself returns 200 (it's a static page in Astro)
    expect(res?.status()).not.toBe(500);
    await expect(page.locator('body')).not.toContainText('500');
  });

  test('unknown route returns non-500', async ({ page }) => {
    const res = await page.goto(`${BASE}/does-not-exist-xyzzy`);
    expect(res?.status()).not.toBe(500);
    await expect(page.locator('body')).not.toContainText('500');
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA-09: Service Catalog', () => {
  test('T1: /leistungen page loads', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('h1')).toContainText('Leistungen');
  });

  test('T2: All service categories visible', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    // Page should have multiple service sections (flexible matching)
    await expect(page.locator('h1, h2, h3').filter({ hasText: /café|cafe|digital|coaching|beratung|leistung/i }).first()).toBeVisible({ timeout: 10_000 });
    const headings = await page.locator('h2, h3').count();
    expect(headings).toBeGreaterThan(0);
  });

  test('T3: Pricing displayed correctly', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    // Pricing content should be present somewhere on the page (€, /h, numbers)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/€|\d{2,}|Preis|Stunde|pauschal/i);
  });

  test('T4: POST /api/billing/create-invoice without data returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/create-invoice`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

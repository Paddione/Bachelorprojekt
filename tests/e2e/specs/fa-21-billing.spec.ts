import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-21: Service Catalog & Billing', () => {
  test('T1: /leistungen page displays services', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.getByRole('heading', { name: /Leistungen|Services/i }).first()).toBeVisible();
    
    // Check for some expected service names
    const content = await page.content();
    expect(content).toMatch(/Digital Cafe|Coaching|Beratung/i);
  });

  test('T2: Service links point to booking page', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    const bookingLinks = page.locator('a[href*="/termin"]');
    const count = await bookingLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('T3: Billing API validates input', async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/create-invoice`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

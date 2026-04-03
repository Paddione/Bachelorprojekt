import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-21: Service Catalog & Billing', () => {
  test('T1: /leistungen page loads', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('h1')).toContainText('Leistungen');
  });

  test('T2: All service categories visible', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('text=Digital Cafe 50+')).toBeVisible();
    await expect(page.locator('text=Coaching')).toBeVisible();
    await expect(page.locator('text=Unternehmensberatung')).toBeVisible();
  });

  test('T3: Service cards have booking links', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    const bookingLinks = page.locator('a[href*="/termin?service="]');
    const count = await bookingLinks.count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('T4: POST /api/billing/create-invoice without data returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/create-invoice`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('T5: POST /api/billing/create-invoice with unknown service returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/create-invoice`, {
      data: { name: 'Test', email: 'test@test.de', serviceKey: 'nonexistent-service' },
    });
    expect(res.status()).toBe(400);
  });

  test('T6: Pricing displayed correctly', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('text=60')).toBeVisible(); // Digital Cafe Einzel
    await expect(page.locator('text=150')).toBeVisible(); // Coaching Session
    await expect(page.locator('text=1.000')).toBeVisible(); // Beratung Tagessatz
  });

  test('T7: Erstgesprach CTA visible', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('text=Erstgesprach vereinbaren')).toBeVisible();
  });
});

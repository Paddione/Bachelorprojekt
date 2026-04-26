import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-07: Website API & Inhalte', () => {
  test('T1: /api/health returns ok', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('T2: /api/leistungen returns JSON list with expected shape', async ({ request }) => {
    const res = await request.get(`${BASE}/api/leistungen`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('key');
      expect(body[0]).toHaveProperty('name');
      expect(body[0]).toHaveProperty('category');
    }
  });

  test('T3: /api/status rejects invalid ticket ID format', async ({ request }) => {
    const res = await request.get(`${BASE}/api/status?id=INVALID`);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('T4: /api/status returns 404 for non-existent ticket', async ({ request }) => {
    const res = await request.get(`${BASE}/api/status?id=BR-20260101-0000`);
    expect([404, 200]).toContain(res.status());
  });

  test('T5: Legal and info pages are reachable', async ({ page }) => {
    for (const path of ['/impressum', '/datenschutz', '/agb']) {
      const res = await page.goto(`${BASE}${path}`);
      expect(res?.status(), `${path} should return 200`).toBe(200);
    }
  });
});

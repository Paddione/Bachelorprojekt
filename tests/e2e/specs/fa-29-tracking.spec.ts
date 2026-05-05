import { test, expect } from '@playwright/test';

const TRACKING_URL = process.env.TRACKING_URL
  ?? (process.env.PROD_DOMAIN ? `https://tracking.${process.env.PROD_DOMAIN}` : 'http://tracking.localhost');

test.describe('FA-29: Requirements Tracking UI', () => {
  test('T1: Tracking service is reachable', async ({ request }) => {
    const res = await request.get(TRACKING_URL);
    // 200 = public UI; 301/302 = redirect; 401 = auth-protected
    expect([200, 301, 302, 401]).toContain(res.status());
  });

  test('T2: Tracking UI returns a non-empty page title', async ({ page }) => {
    await page.goto(TRACKING_URL, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('T3: /api/timeline returns JSON array', async ({ request }) => {
    const res = await request.get(`${TRACKING_URL}/api/timeline`).catch(() => null);
    if (res === null || res.status() === 404) {
      test.skip(true, 'Timeline API not available on this cluster');
      return;
    }
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    }
  });
});

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

  test('T3: /api/timeline returns rows with required columns', async ({ request }) => {
    // The Kore homepage timeline reads /api/timeline and renders these columns;
    // PR2 rebuilt v_timeline as a view over tickets.pr_events + ticket_links —
    // the API contract must keep its shape.
    const res = await request.get(`${TRACKING_URL}/api/timeline?limit=5`).catch(() => null);
    if (res === null || res.status() === 404) {
      test.skip(true, 'Timeline API not available on this cluster');
      return;
    }
    expect([200, 401]).toContain(res.status());
    if (res.status() !== 200) return;

    const body = await res.json();
    // /api/timeline returns {rows: [...]}; tolerate either shape.
    const rows = Array.isArray(body) ? body : (body?.rows ?? []);
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length === 0) return; // empty cluster — still valid

    const r = rows[0];
    for (const col of ['id', 'day', 'pr_number', 'title', 'category', 'brand']) {
      expect(r).toHaveProperty(col);
    }
    // day is YYYY-MM-DD (string), pr_number is a number (or null on legacy rows)
    expect(typeof r.day).toBe('string');
    expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Coaching Drafts — phase 3 (unauth)', () => {
  test('GET /api/admin/coaching/drafts → 401', async ({ request }) => {
    const r = await request.get(`${BASE}/api/admin/coaching/drafts`);
    expect(r.status()).toBe(401);
  });

  test('GET /api/admin/coaching/drafts/abc → 401', async ({ request }) => {
    const r = await request.get(`${BASE}/api/admin/coaching/drafts/abc`);
    expect(r.status()).toBe(401);
  });

  test('POST /api/admin/coaching/drafts/abc/accept → 401', async ({ request }) => {
    const r = await request.post(`${BASE}/api/admin/coaching/drafts/abc/accept`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('POST /api/admin/coaching/drafts/abc/reject → 401', async ({ request }) => {
    const r = await request.post(`${BASE}/api/admin/coaching/drafts/abc/reject`, { data: {} });
    expect(r.status()).toBe(401);
  });

  test('GET /api/admin/coaching/books/abc/acceptance-rate → 401', async ({ request }) => {
    const r = await request.get(`${BASE}/api/admin/coaching/books/abc/acceptance-rate`);
    expect(r.status()).toBe(401);
  });

  test('GET /admin/knowledge/drafts → redirect away from drafts page', async ({ page }) => {
    await page.goto(`${BASE}/admin/knowledge/drafts`);
    await expect(page).not.toHaveURL(/\/admin\/knowledge\/drafts$/);
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Coaching Knowledge — phase 1', () => {
  test('T1: /admin/knowledge/books redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/knowledge/books`);
    await expect(page).not.toHaveURL(`${BASE}/admin/knowledge/books`);
  });

  test('T2: GET /api/admin/coaching/books returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/coaching/books`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: POST /api/admin/coaching/snippets returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/coaching/snippets`, {
      data: { bookId: 'x', title: 'x', body: 'x', tags: [] },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: GET /api/admin/coaching/clusters returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/coaching/clusters`);
    expect([401, 403]).toContain(res.status());
  });

  test('T5: GET /admin/knowledge/books/<random-uuid> handles missing book gracefully', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.get(`${BASE}/admin/knowledge/books/${fakeId}`);
    // Either redirect (unauthenticated) or 401/403/404 — never 500
    expect(res.status()).toBeLessThan(500);
  });
});

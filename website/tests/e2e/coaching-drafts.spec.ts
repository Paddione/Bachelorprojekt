// website/tests/e2e/coaching-drafts.spec.ts
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'https://web.mentolder.de';

test.describe('coaching drafts — unauth', () => {
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

  test('GET /admin/knowledge/drafts → redirect to login', async ({ page }) => {
    const resp = await page.goto(`${BASE}/admin/knowledge/drafts`);
    // Either a 302 to /admin/login or a rendered login page; just assert we don't see Inbox content.
    await expect(page).not.toHaveURL(/\/admin\/knowledge\/drafts$/);
  });
});

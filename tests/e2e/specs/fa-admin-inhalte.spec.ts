import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Inhalte — unified content editor + legacy stubs', () => {
  // ── Main editor ────────────────────────────────────────────────
  test('T1: /admin/inhalte redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/inhalte`);
    await expect(page).not.toHaveURL(`${BASE}/admin/inhalte`);
  });

  // ── Legacy stubs (auth-gate → 301 to /admin/inhalte) ──────────
  const legacyStubs = [
    '/admin/angebote',
    '/admin/faq',
    '/admin/kontakt',
    '/admin/rechtliches',
    '/admin/referenzen',
    '/admin/startseite',
    '/admin/uebermich',
  ];

  for (const path of legacyStubs) {
    test(`T: ${path} redirects unauthenticated users`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await expect(page).not.toHaveURL(`${BASE}${path}`);
    });
  }

  // ── API auth checks ────────────────────────────────────────────
  test('T: POST /api/admin/angebote/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/angebote/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T: GET /api/admin/inhalte/custom returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/inhalte/custom`);
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/inhalte/custom returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/inhalte/custom`, { data: { slug: 'test', title: 'T', body: '' } });
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/faq/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/faq/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/kontakt/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/kontakt/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/rechtliches/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/rechtliches/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/referenzen/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/referenzen/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/startseite/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/startseite/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/uebermich/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/uebermich/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T: POST /api/admin/inhalte/rechnungsvorlagen/save returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/inhalte/rechnungsvorlagen/save`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });
});

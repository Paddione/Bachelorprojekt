import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin native billing system (SEPA/ZUGFeRD)', () => {
  // ── Page auth-gating ───────────────────────────────────────────
  const adminPages = [
    '/admin/rechnungen',
    '/admin/steuer',
    '/admin/buchhaltung',
  ];

  for (const path of adminPages) {
    test(`${path} redirects unauthenticated users`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await expect(page).not.toHaveURL(`${BASE}${path}`);
    });
  }

  test('/admin/billing/:id/drucken redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/billing/00000000-0000-0000-0000-000000000000/drucken`);
    await expect(page).not.toHaveURL(/\/admin\/billing\/.*\/drucken/);
  });

  test('/portal/billing/:id/drucken redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/portal/billing/00000000-0000-0000-0000-000000000000/drucken`);
    await expect(page).not.toHaveURL(/\/portal\/billing\/.*\/drucken/);
  });

  // ── Billing invoice CRUD API ───────────────────────────────────
  test('GET /api/admin/billing/drafts returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/billing/drafts`);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/billing/draft-count returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/billing/draft-count`);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/billing/:id returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/billing/00000000-0000-0000-0000-000000000000`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /api/admin/billing/:id/send returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/billing/00000000-0000-0000-0000-000000000000/send`, { data: {} });
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /api/admin/billing/:id/discard returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/billing/00000000-0000-0000-0000-000000000000/discard`, { data: {} });
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /api/admin/billing/create-monthly-invoices returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/billing/create-monthly-invoices`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  // ── Bookkeeping / EÜR ─────────────────────────────────────────
  test('GET /api/admin/bookkeeping/summary returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/bookkeeping/summary`);
    expect([401, 403]).toContain(res.status());
  });

  // ── Tax monitor (UStVA / Kleinunternehmer threshold) ──────────
  test('GET /api/admin/tax-monitor/status returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/tax-monitor/status`);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/tax-monitor/ustvaexport returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/tax-monitor/ustvaexport`);
    expect([401, 403]).toContain(res.status());
  });

  // ── ZUGFeRD export (portal) ────────────────────────────────────
  test('GET /api/billing/invoice/:id/zugferd returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/billing/invoice/00000000-0000-0000-0000-000000000000/zugferd`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

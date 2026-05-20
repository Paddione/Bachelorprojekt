import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'https://web.mentolder.de';

test.describe('FA-41: Admin Platform Hub — visual overhaul', () => {
  // ── Auth-Gating ────────────────────────────────────────────────
  test('T1: /admin/platform requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/admin/platform`);
    await expect(page).not.toHaveURL(`${BASE}/admin/platform`);
  });

  test('T2: /admin/ops requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/admin/ops`);
    await expect(page).not.toHaveURL(`${BASE}/admin/ops`);
  });

  // ── API Auth-Gating ────────────────────────────────────────────
  test('T3: GET /api/admin/platform/status returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/status`);
    expect([401, 403]).toContain(res.status());
  });

  test('T4: POST /api/admin/platform/sync returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/platform/sync`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });
});

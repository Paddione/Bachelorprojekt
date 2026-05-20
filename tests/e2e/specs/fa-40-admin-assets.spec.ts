import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'https://web.mentolder.de';

test.describe('FA-40: Admin Assets — central asset management', () => {
  // ── Auth-Gating ────────────────────────────────────────────────
  test('T1: /admin/assets requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/admin/assets`);
    await expect(page).not.toHaveURL(`${BASE}/admin/assets`);
  });

  // ── API Auth-Gating ────────────────────────────────────────────
  test('T2: GET /api/admin/assets returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/assets`);
    expect([401, 403]).toContain(res.status());
  });

  // ── Content check (Public assets) ──────────────────────────────
  test('T3: public assets are accessible', async ({ request }) => {
    const res = await request.get(`${BASE}/favicon.svg`);
    expect(res.status()).toBe(200);
  });
});

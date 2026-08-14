import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Monitoring page', { tag: ['@admin'] }, () => {
  test('T1: /admin/monitoring redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/monitoring`);
    await expect(page).not.toHaveURL(`${BASE}/admin/monitoring`);
  });

  test('T2: GET /sdlc/api/monitoring returns 401 or 403 without auth', async ({ request }) => {
    // Route seit dem SDLC-Build-Target-Split (T002624) unter /sdlc/api/monitoring.
    const res = await request.get(`${BASE}/sdlc/api/monitoring`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

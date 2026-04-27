import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Monitoring page', () => {
  test('T1: /admin/monitoring redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/monitoring`);
    await expect(page).not.toHaveURL(`${BASE}/admin/monitoring`);
  });

  test('T2: GET /api/admin/monitoring returns 401 or 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/monitoring`);
    expect([401, 403]).toContain(res.status());
  });
});

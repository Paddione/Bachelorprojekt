import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Newsletter page', () => {
  test('T1: /admin/newsletter redirects to /admin/dokumente', async ({ page }) => {
    await page.goto(`${BASE}/admin/newsletter`);
    // Newsletter is a redirect stub — always redirects to dokumente (auth-gate is on dokumente)
    await expect(page).not.toHaveURL(`${BASE}/admin/newsletter`);
  });

  test('T2: GET /api/admin/newsletter/campaigns returns 401 or 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/newsletter/campaigns`);
    expect([401, 403]).toContain(res.status());
  });
});

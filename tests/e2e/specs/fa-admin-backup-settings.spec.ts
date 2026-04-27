import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Backup Settings page', () => {
  test('T1: /admin/einstellungen/backup redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/einstellungen/backup`);
    await expect(page).not.toHaveURL(`${BASE}/admin/einstellungen/backup`);
  });

  test('T2: POST /api/admin/einstellungen/backup returns 401 or 403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/einstellungen/backup`, {
      form: { filen_upload_path: '/test' },
    });
    expect([401, 403]).toContain(res.status());
  });
});

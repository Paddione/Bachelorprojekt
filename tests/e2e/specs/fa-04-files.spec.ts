import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-04: Dateiablage (Projektanhänge)', () => {
  test('T1: /api/portal/projekte requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/projekte`);
    expect([401, 403]).toContain(res.status());
  });

  test('T2: /api/admin/projekte/attachments/upload requires admin auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/projekte/attachments/upload`, {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T3: /api/admin/projekte/attachments/delete requires admin auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/projekte/attachments/delete`, {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: /api/admin/projekte/create requires admin auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/projekte/create`, {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T5: Portal Projekte section redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/portal?section=projekte`);
    await expect(page).not.toHaveURL(/\/portal/);
  });
});

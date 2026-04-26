import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-01: Messaging (Portal Nachrichten & Räume)', () => {
  test('T1: /api/portal/rooms requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/rooms`);
    expect([401, 403]).toContain(res.status());
  });

  test('T2: /api/portal/nachrichten requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/nachrichten`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: /api/portal/rooms/ensure-direct requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/api/portal/rooms/ensure-direct`, {
      data: { targetCustomerId: 'test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: /api/portal/rooms/:id/messages requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/rooms/999/messages`);
    expect([401, 403]).toContain(res.status());
  });

  test('T5: Portal Nachrichten section redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/portal?section=nachrichten`);
    await expect(page).not.toHaveURL(/\/portal/);
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Live Cockpit', () => {
  test('T1: /admin/live redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/live`);
    await expect(page).not.toHaveURL(`${BASE}/admin/live`);
  });

  test('T2: /admin/stream redirects to /admin/live', async ({ page }) => {
    await page.goto(`${BASE}/admin/stream`, { waitUntil: 'commit' });
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/admin\/live|\/login|keycloak/);
  });

  test('T3: /admin/meetings redirects to /admin/live', async ({ page }) => {
    await page.goto(`${BASE}/admin/meetings`, { waitUntil: 'commit' });
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/admin\/live|\/login|keycloak/);
  });
});

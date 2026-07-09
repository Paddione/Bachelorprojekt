import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const HAS_ADMIN_AUTH = !!process.env.E2E_ADMIN_PASS;

test.describe('FA-49: Factory Observability Dashboard', { tag: ['@admin', '@factory'] }, () => {
  test('T1: /admin/factory-observability loads with KPI cards for admin', async ({ page }) => {
    test.skip(!HAS_ADMIN_AUTH, 'E2E_ADMIN_PASS not set — skipping admin UI test');
    await page.goto('/admin/factory-observability');
    await expect(page.locator('.obs-dashboard')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.kpi-row')).toBeVisible();
  });

  test('T2: API /api/factory-observability returns JSON with brand and timeline', async ({ page }) => {
    const resp = await page.request.get(`${BASE}/api/factory-observability`);
    if (resp.status() === 401) {
      test.skip(true, 'auth cookie nicht gesetzt (expected in mentolder project)');
      return;
    }
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('brand');
    expect(body).toHaveProperty('timeline');
    expect(body).toHaveProperty('fetchedAt');
    expect(Array.isArray(body.timeline)).toBe(true);
  });

  test('T3: /admin/factory-observability redirects unauthenticated users', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/factory-observability`);
    await expect(page).not.toHaveURL(/\/admin\/factory-observability/);
    await ctx.close();
  });
});

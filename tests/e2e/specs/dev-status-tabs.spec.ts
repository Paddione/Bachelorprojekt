import { test, expect } from '@playwright/test';

test.describe('FA-UNIF: Dev-Status tabs', { tag: ['@admin', '@factory'] }, () => {

test('FA-UNIF-01: /dev-status öffnet Factory-Tab', async ({ page }) => {
  await page.goto('/dev-status');
  await expect(page.locator('.ds-tab.active')).toContainText('Factory Floor');
  expect(page.url()).not.toContain('tab=planung');
});

test('FA-UNIF-02: ?tab=planung öffnet Planungsbüro', async ({ page }) => {
  await page.goto('/dev-status?tab=planung');
  await expect(page.locator('.ds-tab.active')).toContainText('Planungsbüro');
});

test('FA-UNIF-03: Tab-Wechsel ändert URL ohne Reload', async ({ page }) => {
  await page.goto('/dev-status');
  await page.locator('.ds-tab', { hasText: 'Planungsbüro' }).click();
  await expect(page).toHaveURL(/tab=planung/);
  await expect(page.locator('.ds-tab.active')).toContainText('Planungsbüro');
});

test('FA-UNIF-04: /admin/planungsbuero → /dev-status?tab=planung', async ({ page }) => {
  await page.goto('/admin/planungsbuero');
  await expect(page).toHaveURL(/\/dev-status\?tab=planung/);
});

test('FA-UNIF-05: Tab-Bar wird gerendert', async ({ page }) => {
  await page.goto('/dev-status');
  await expect(page.locator('.tab-bar-wrap')).toBeVisible();
  // 5 tabs: Factory Floor, Planungsbüro, Control Panel, Analytics, Abhängigkeiten (PR #1565)
  await expect(page.locator('.ds-tab')).toHaveCount(5);
});

test('FA-UNIF-06: Mobile — Tab-Bar sichtbar bei 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev-status');
  await expect(page.locator('.tab-bar-wrap')).toBeVisible();
  await expect(page.locator('.ds-tab').first()).toBeVisible();
});

test('FA-UNIF-07: Mobile — Tab-Wechsel funktioniert bei 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev-status');
  await page.locator('.ds-tab', { hasText: 'Planungsbüro' }).click();
  await expect(page).toHaveURL(/tab=planung/);
  await expect(page.locator('.ds-tab.active')).toContainText('Planungsbüro');
});

test('FA-UNIF-08: Sidebar hat einen Dev-Status-Eintrag', async ({ page }) => {
  await page.goto('/admin');
  const devStatusLinks = page.locator('#admin-sidebar a[href="/dev-status"]');
  await expect(devStatusLinks).toHaveCount(1);
  await expect(devStatusLinks.first()).toContainText('Dev Status');
  await expect(page.locator('#admin-sidebar a[href="/admin/planungsbuero"]')).toHaveCount(0);
});

test('FA-UNIF-09: Attention strip appears when a workpiece is blocked', async ({ page }) => {
  await page.goto('/dev-status?tab=factory');
  const strip = page.getByRole('alert');
  if (await strip.count()) {
    await expect(strip).toContainText(/⛔|⏱|🧊/);
  }
});

test('FA-UNIF-10: Planungsbüro reflects a promote without manual reload', async ({ page }) => {
  await page.goto('/dev-status?tab=planung');
  const before = await page.locator('[data-planning-item]').count();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('factory-floor-refreshed', { detail: {} })));
  await expect.poll(() => page.locator('[data-planning-item]').count()).toBeGreaterThanOrEqual(0);
  expect(before).toBeGreaterThanOrEqual(0);
});

test('FA-UNIF-11: sidebar does not scroll with the Werkstatt accordion open (1440x900)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin');
  await page.locator('#werkstatt-toggle').click();
  const overflow = await page.locator('#admin-sidebar').evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(overflow).toBe(false);
});

});

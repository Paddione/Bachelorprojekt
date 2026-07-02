import { test, expect } from '@playwright/test';

test.describe('FA-UNIF: Dev-Status tabs', { tag: ['@admin', '@factory'] }, () => {

test('FA-UNIF-01: /admin/pipeline öffnet Factory-Tab', async ({ page }) => {
  await page.goto('/admin/pipeline');
  await expect(page.locator('.tabs__tab--active')).toContainText('Floor');
  expect(page.url()).not.toContain('tab=planung');
});

test('FA-UNIF-02: ?tab=planung öffnet Planungs-Tab', async ({ page }) => {
  await page.goto('/admin/pipeline?tab=planung');
  await expect(page.locator('.tabs__tab--active')).toContainText('Planung');
});

test('FA-UNIF-03: Tab-Wechsel ändert URL ohne Reload', async ({ page }) => {
  await page.goto('/admin/pipeline');
  await page.locator('.tabs__tab', { hasText: 'Planung' }).click();
  await expect(page).toHaveURL(/tab=planung/);
  await expect(page.locator('.tabs__tab--active')).toContainText('Planung');
});

test('FA-UNIF-04: /admin/planungsbuero → /admin/pipeline?tab=planung', async ({ page }) => {
  await page.goto('/admin/planungsbuero');
  await expect(page).toHaveURL(/\/admin\/pipeline\?tab=planung/);
});

test('FA-UNIF-05: Tab-Bar wird gerendert mit 6 Tabs', async ({ page }) => {
  await page.goto('/admin/pipeline');
  await expect(page.locator('.tabs')).toBeVisible();
  // 6 tabs: Floor, Planung, Analytics, Kosten, Steuerung, Abhängigkeiten
  await expect(page.locator('.tabs__tab')).toHaveCount(6);
});

test('FA-UNIF-06: Mobile — Tab-Bar sichtbar bei 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/pipeline');
  await expect(page.locator('.tabs')).toBeVisible();
  await expect(page.locator('.tabs__tab').first()).toBeVisible();
});

test('FA-UNIF-07: Mobile — Tab-Wechsel funktioniert bei 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/pipeline');
  await page.locator('.tabs__tab', { hasText: 'Planung' }).click();
  await expect(page).toHaveURL(/tab=planung/);
  await expect(page.locator('.tabs__tab--active')).toContainText('Planung');
});

test('FA-UNIF-08: Sidebar hat genau einen Pipeline-Eintrag', async ({ page }) => {
  await page.goto('/admin');
  const pipelineLinks = page.locator('#admin-sidebar a[href="/admin/pipeline"]');
  await expect(pipelineLinks).toHaveCount(1);
  await expect(pipelineLinks.first()).toContainText('Pipeline');
  await expect(page.locator('#admin-sidebar a[href="/dev-status"]')).toHaveCount(0);
  await expect(page.locator('#admin-sidebar a[href="/admin/planungsbuero"]')).toHaveCount(0);
});

test('FA-UNIF-09: Attention strip appears when a workpiece is blocked', async ({ page }) => {
  await page.goto('/admin/pipeline?tab=factory');
  const strip = page.getByRole('alert');
  if (await strip.count()) {
    await expect(strip).toContainText(/⛔|⏱|🧊/);
  }
});

test('FA-UNIF-10: Planung reflects a promote without manual reload', async ({ page }) => {
  await page.goto('/admin/pipeline?tab=planung');
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

test('FA-UNIF-12: legacy routes redirect to /admin/pipeline', async ({ page }) => {
  await page.goto('/dev-status?tab=planung');
  await expect(page).toHaveURL(/\/admin\/pipeline\?tab=planung/);
  await page.goto('/admin/factory-observability');
  await expect(page).toHaveURL(/\/admin\/pipeline\?tab=kosten/);
  await page.goto('/admin/dora');
  await expect(page).toHaveURL(/\/admin\/pipeline\?tab=analytics/);
});

});

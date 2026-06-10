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
  await expect(page.locator('.ds-tab')).toHaveCount(2);
});

test('FA-UNIF-06: Mobile — Fokus-Ansicht sichtbar bei 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev-status');
  await expect(page.locator('.mobile-col-nav')).toBeVisible();
  await expect(page.locator('.mobile-pips')).toBeVisible();
});

test('FA-UNIF-07: Mobile — Pfeil-Button wechselt Spalte', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev-status');
  const titleBefore = await page.locator('.mobile-col-title').textContent();
  await page.locator('.mobile-nav-arrow').last().click();
  const titleAfter = await page.locator('.mobile-col-title').textContent();
  expect(titleAfter).not.toBe(titleBefore);
});

test('FA-UNIF-08: Sidebar hat einen Dev-Status-Eintrag', async ({ page }) => {
  await page.goto('/admin');
  const devStatusLinks = page.locator('#admin-sidebar a[href="/dev-status"]');
  await expect(devStatusLinks).toHaveCount(1);
  await expect(devStatusLinks.first()).toContainText('Dev Status');
  await expect(page.locator('#admin-sidebar a[href="/admin/planungsbuero"]')).toHaveCount(0);
});

});

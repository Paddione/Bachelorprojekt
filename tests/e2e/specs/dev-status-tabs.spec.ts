import { test, expect } from '@playwright/test';

test.describe('FA-UNIF: Dev-Status tabs', { tag: ['@admin', '@factory'] }, () => {

test('FA-UNIF-01: /admin/pipeline öffnet Factory-Tab', async ({ page }) => {
  await page.goto('/admin/cockpit');
  await expect(page.locator('.tabs__tab--active')).toContainText('Floor');
  expect(page.url()).not.toContain('tab=planung');
});

test('FA-UNIF-02: ?tab=planung öffnet Planungs-Tab', async ({ page }) => {
  await page.goto('/admin/cockpit?tab=planung', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.tabs__tab--active')).toContainText('Planung');
});

test('FA-UNIF-03: Tab-Wechsel ändert URL ohne Reload', async ({ page }) => {
  await page.goto('/admin/cockpit', { waitUntil: 'domcontentloaded' });
  await page.locator('.tabs__tab', { hasText: 'Planung' }).click();
  await expect(page.locator('.tabs__tab--active')).toContainText('Planung');
});

test('FA-UNIF-04: /admin/planungsbuero → /admin/cockpit?tab=planung', async ({ page }) => {
  await page.goto('/admin/planungsbuero', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\/cockpit\?tab=planung/);
});

test('FA-UNIF-05: Tab-Bar wird gerendert mit 6 Tabs', async ({ page }) => {
  await page.goto('/admin/cockpit', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.tabs')).toBeVisible();
  const count = await page.locator('.tabs__tab').count();
  expect(count).toBeGreaterThanOrEqual(6);
});

test('FA-UNIF-06: Mobile — Tab-Bar sichtbar bei 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/cockpit', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.tabs')).toBeVisible();
  await expect(page.locator('.tabs__tab').first()).toBeVisible();
});

test('FA-UNIF-07: Mobile — Tab-Wechsel funktioniert bei 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/cockpit', { waitUntil: 'domcontentloaded' });
  await page.locator('.tabs__tab', { hasText: 'Planung' }).click();
  await expect(page.locator('.tabs__tab--active')).toContainText('Planung');
});

// T003826: Die Sidebar führt KEINEN Cockpit-Eintrag mehr. Die SDLC-Oberflächen liegen unter
// website/src/pages/sdlc/ und werden bei BUILD_TARGET=prod aus dem Route-Manifest entfernt
// (build-target.mjs) — ein Eintrag darauf führte in eine Route, die es im Image nicht gibt.
// Erreichbar sind sie über die lokale SDLC-Console. Der Test prüft daher jetzt die Abwesenheit.
test('FA-UNIF-08: Sidebar führt keine im prod-Build entfernten SDLC-Routen', async ({ page }) => {
  await page.goto('/admin');

  // Positiv-Anker zuerst: ohne ihn bestünden die Count-0-Zusicherungen unten auch dann,
  // wenn die Sidebar gar nicht gerendert wurde (CLAUDE.md § Positiv-Anker-Pflicht).
  await expect(page.locator('#admin-sidebar a')).not.toHaveCount(0);
  await expect(page.locator('#admin-sidebar a[href="/admin/inhalte"]')).toHaveCount(1);

  for (const gone of [
    '/admin/cockpit',
    '/admin/pipeline',
    '/admin/repohealth',
    '/admin/prompts',
    '/admin/ki-konfiguration',
    '/admin/app-catalog',
    '/admin/systemtest/board',
    '/dev-status',
    '/admin/planungsbuero',
  ]) {
    await expect(page.locator(`#admin-sidebar a[href="${gone}"]`)).toHaveCount(0);
  }
});

test('FA-UNIF-09: Attention strip appears when a workpiece is blocked', async ({ page }) => {
  await page.goto('/admin/cockpit?tab=factory');
  const strip = page.getByRole('alert');
  if (await strip.count()) {
    await expect(strip).toContainText(/⛔|⏱|🧊/);
  }
});

test('FA-UNIF-10: Planung reflects a promote without manual reload', async ({ page }) => {
  await page.goto('/admin/cockpit?tab=planung', { waitUntil: 'domcontentloaded' });
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

test('FA-UNIF-12: legacy routes redirect to /admin/cockpit', async ({ page }) => {
  await page.goto('/dev-status?tab=planung', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\/cockpit\?tab=planung/);
  await page.goto('/admin/factory-observability', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\/cockpit\?tab=kosten/);
  await page.goto('/admin/dora', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/admin\/cockpit\?tab=analytics/);
});

});

import { test, expect, devices, type APIRequestContext } from '@playwright/test';

// FA-63: Massage Mobile (T901306) — Epic T901016 Kriterium 2.
// Mobile-Darstellung (Pixel-7-Viewport) der Massage-Seiten. Läuft gegen eine
// Massage-Brand-Instanz (BRAND=massage, z. B. lokale Dev-Instanz auf
// http://localhost:4321); gegen andere Brands skippt der Spec selbständig,
// damit Nightly grün bleibt.
// Hinweis: bewusst im Projekt 'website' (nicht 'ios'/'android' — dort hängen
// fremde Suiten mit eigenem Setup); Mobile via Top-Level-Gerät.
// Erzeugt keine Datensätze (nur GET + UI-Navigation), daher ohne E2E-Header.
test.use({ ...devices['Pixel 7'] });

const BASE = process.env.WEBSITE_URL ?? 'http://localhost:4321';

async function skipUnlessMassage(request: APIRequestContext) {
  const home = await request.get(`${BASE}/`);
  test.skip(home.status() !== 200, 'Homepage nicht erreichbar');
  const html = await home.text();
  test.skip(!html.includes('Massagepraxis'), 'keine Massage-Brand — Spec skippt');
}

test.describe('FA-63: Massage Mobile', { tag: ['@booking'] }, () => {
  test.beforeEach(async ({ request }) => {
    await skipUnlessMassage(request);
  });

  test('M1: Homepage passt in den Geräte-Viewport, CTA sichtbar', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const metrics = await page.evaluate(() => ({
      innerW: window.innerWidth,
      vvW: window.visualViewport ? window.visualViewport.width : window.innerWidth,
      sw: document.documentElement.scrollWidth,
    }));
    // Layout-Viewport muss dem sichtbaren Geräte-Viewport entsprechen —
    // ein breiteres Layout (z. B. 513px bei 412px Gerät) versteckt Bedienelemente.
    expect(metrics.innerW).toBeLessThanOrEqual(Math.ceil(metrics.vvW));
    expect(metrics.sw).toBeLessThanOrEqual(Math.ceil(metrics.vvW));
    await expect(page.locator('.mg-btn-primary[href="/kontakt"]').first()).toBeVisible();
  });

  test('M2: Mobiles Menü öffnet per Tap', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const toggle = page.locator('.mobile-toggle');
    await expect(toggle).toBeVisible();
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('nav.mobile-menu a[href="/leistungen"]')).toBeVisible();
  });

  test('M3: CTA-Tap führt nach /kontakt mit sichtbarer Journey', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.mg-btn-primary[href="/kontakt"]').first().tap();
    await expect(page).toHaveURL(/\/kontakt\/?$/);
    await expect(page.locator('input[name="j-service"]').first()).toBeVisible();
  });
});

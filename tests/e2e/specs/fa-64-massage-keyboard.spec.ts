import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// FA-64: Massage Tastatur (T901306) — Epic T901016 Kriterium 2.
// Tastaturbedienung der Massage-Seiten (Tab-Reihenfolge, sichtbarer Fokus,
// Journey per Tastatur). Läuft gegen eine Massage-Brand-Instanz
// (BRAND=massage, z. B. lokale Dev-Instanz auf http://localhost:4321); gegen
// andere Brands skippt der Spec selbständig, damit Nightly grün bleibt.
// Erzeugt keine Datensätze (nur GET + UI-Navigation), daher ohne E2E-Header.
const BASE = process.env.WEBSITE_URL ?? 'http://localhost:4321';

async function skipUnlessMassage(request: APIRequestContext) {
  const home = await request.get(`${BASE}/`);
  test.skip(home.status() !== 200, 'Homepage nicht erreichbar');
  const html = await home.text();
  test.skip(!html.includes('Massagepraxis'), 'keine Massage-Brand — Spec skippt');
}

async function tabUntil(page: Page, predicate: string, max = 40): Promise<boolean> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((sel: string) => {
      const el = document.activeElement;
      return el instanceof HTMLElement && el.matches(sel);
    }, predicate);
    if (hit) return true;
  }
  return false;
}

test.describe('FA-64: Massage Tastatur', { tag: ['@booking'] }, () => {
  test.beforeEach(async ({ request }) => {
    await skipUnlessMassage(request);
  });

  test('K1: CTA per Tab erreichbar mit sichtbarem Fokus', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const reached = await tabUntil(page, 'a[href="/kontakt"]');
    expect(reached).toBe(true);
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: cs.outlineWidth };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).not.toBe('0px');
  });

  test('K2: Tastatur-Journey bis Kontakt-Journey', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const reachedCta = await tabUntil(page, 'a[href="/kontakt"]');
    expect(reachedCta).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/kontakt\/?$/);
    const reachedJourney = await tabUntil(
      page,
      'input[name="j-service"], .ch-mode, .j-btn',
      60,
    );
    expect(reachedJourney).toBe(true);
  });
});

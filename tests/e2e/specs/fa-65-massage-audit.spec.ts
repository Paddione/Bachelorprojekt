import { test, expect, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// FA-65: Massage Audit (T901307) — Epic T901016 Kriterium 5.
// Barrierefreiheit (axe, 0 critical/serious) und Lade-Smoke der fünf
// öffentlichen Massage-Seiten. Budgets: siehe Owner-Runbook (Abschnitt
// Performance- und Accessibility-Budgets; Freigabe via Owner-Fragebogen).
// Läuft gegen eine Massage-Brand-Instanz (BRAND=massage, z. B. lokale
// Dev-Instanz auf http://localhost:4321); gegen andere Brands skippt der
// Spec selbständig, damit Nightly grün bleibt.
// Hinweis: Die Lade-Zeiten hier sind ein Dev-Smoke (großzügige Schwellen,
// Vite-Dev ist nicht produktiv optimiert). Die CWV-Budgets werden nach dem
// Deploy auf der Live-Umgebung geprüft. Erzeugt keine Datensätze.
const BASE = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ROUTES = ['/', '/leistungen', '/faq', '/ueber-mich', '/kontakt'];
const SERIOUS = new Set(['critical', 'serious']);
// Dev-Smoke-Schwelle: fängt nur pathologisches Hängen, kein CWV-Budget.
const DEV_LOAD_MS = 20_000;

async function skipUnlessMassage(request: APIRequestContext) {
  const home = await request.get(`${BASE}/`);
  test.skip(home.status() !== 200, 'Homepage nicht erreichbar');
  const html = await home.text();
  test.skip(!html.includes('Massagepraxis'), 'keine Massage-Brand — Spec skippt');
}

test.describe('FA-65: Massage Audit', { tag: ['@booking'] }, () => {
  test.beforeEach(async ({ request }) => {
    await skipUnlessMassage(request);
  });

  for (const route of ROUTES) {
    test(`A1: axe ${route} hat 0 critical/serious`, async ({ page }) => {
      test.setTimeout(30_000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      // Cookie-Banner erscheint erst nach Client-Hydration — deterministisch
      // abwarten, damit der Scan es immer einschließt (T901370).
      await page.locator('button[aria-controls="cookie-details"]').waitFor({ timeout: 10_000 });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? ''));
      const summary = blocking.map((v) => `${v.id} (${v.impact})`).join(', ');
      expect(blocking.length, summary).toBe(0);
    });

    test(`P1: ${route} lädt im Dev-Smoke unter ${DEV_LOAD_MS / 1000}s`, async ({ page }) => {
      test.setTimeout(30_000);
      await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
      const loadMs = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return nav ? nav.loadEventEnd : -1;
      });
      expect(loadMs).toBeGreaterThanOrEqual(0);
      expect(loadMs).toBeLessThan(DEV_LOAD_MS);
    });
  }
});

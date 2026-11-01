import { test, expect } from '@playwright/test';

// docs-smoke: öffentliche Info-/Content-Seiten der Website rendern
// (GET → 200, keine Platzhalter-Texte wie in fa-66) und ihre internen Links
// liefern keinen 404 (max. 20 Links/Seite — Deckel gegen Laufzeit-Explosion).
//
// Routenliste als Konstante hier (kein neues Config-File): öffentliche Seiten,
// die auch ohne Auth auslieferbar sind — vgl. public-routes.json (Core) plus
// Info-/Rechtsseiten aus fa-public-pages.spec.ts.
const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

const DOCS_ROUTES = [
  '/',
  '/ueber-mich',
  '/kontakt',
  '/coaching',
  '/leistungen',
  '/faq',
  '/referenzen',
  '/datenschutz',
  '/impressum',
  '/agb',
  '/barrierefreiheit',
  '/cookie-einstellungen',
];

test.describe('docs-smoke: öffentliche Content-Seiten', { tag: ['@website', '@smoke'] }, () => {
  for (const path of DOCS_ROUTES) {
    test(`${path} rendert 200, interne Links ohne 404`, async ({ page, request }) => {
      test.setTimeout(30_000);
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${path} HTTP-Status`).toBe(200);

      const bodyText = await page.evaluate(() => document.body.innerText);
      const bad = [...new Set([...bodyText.matchAll(/\b(undefined|NaN|\[object Object\])\b/g)].map((m) => m[0]))];
      expect(bad, 'Platzhalter-Texte im Inhalt').toEqual([]);

      const hrefs: string[] = await page.evaluate(() =>
        [...new Set(
          Array.from(document.querySelectorAll('a[href^="/"]'))
            .map((a) => a.getAttribute('href') ?? '')
            .filter((h) => h.length > 1 && !h.startsWith('/#')),
        )].slice(0, 20),
      );
      for (const href of hrefs) {
        const link = await request.get(`${BASE}${href}`);
        expect(link.status(), `interner Link ${href} auf ${path}`).toBeLessThan(400);
      }
    });
  }
});

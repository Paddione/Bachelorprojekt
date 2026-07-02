import { test, expect } from '@playwright/test';

// T001490 Task 8: DB-down decoupling smoke.
//
// Acceptance: with shared-db scaled to 0, the public site still
// renders HTTP 200 for every brand with the expected content. The
// content is served from the build-time bundle (no DB dependency).
//
// This spec is tagged `@db-down` so it does NOT run in the default
// `task test:e2e` flow. To run it: scale `shared-db` to 0 in k3d,
// then `cd tests/e2e && pnpm exec playwright test --grep @db-down`.

type Brand = 'mentolder' | 'korczewski';
const BRAND_BASES: ReadonlyArray<{ brand: Brand; baseUrl: string }> = (() => {
  const defaultBase = process.env.WEBSITE_URL || 'http://localhost:4321';
  // Both brands share the same Astro server in dev; production routes
  // them by Host header — set WEBSITE_URL_KORCZEWSKI to override.
  return [
    { brand: 'mentolder',   baseUrl: process.env.WEBSITE_URL_MENTOLDER   || defaultBase },
    { brand: 'korczewski',  baseUrl: process.env.WEBSITE_URL_KORCZEWSKI  || defaultBase },
  ];
})();

const PAGES = [
  { path: '/',            marker: /mentolder|korz?cewski|coaching|führung/i },
  { path: '/leistungen',  marker: /leistung|service|angebot/i },
  { path: '/faq',         marker: /faq|frage|antwort/i },
  { path: '/kontakt',     marker: /kontakt|email|telefon|@/i },
] as const;

for (const { brand, baseUrl } of BRAND_BASES) {
  test.describe(`DB-down decoupling: ${brand} @ ${baseUrl}`, { tag: ['@db-down', '@website-decouple'] }, () => {
    test.use({ baseURL: baseUrl });

    for (const { path, marker } of PAGES) {
      test(`${brand} ${path} renders 200 with content even when shared-db is down`, async ({ page }) => {
        const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
        expect(res?.status(), `${brand} ${path} should be HTTP 200`).toBe(200);
        // The body must contain brand-relevant content (the bundle
        // renders brand-specific text via brand config + content JSON).
        const body = await page.locator('body').innerText({ timeout: 10_000 });
        expect(body, `${brand} ${path} should contain content marker`).toMatch(marker);
        // Critical: no raw 500 leak, no Astro error overlay.
        expect(body).not.toContain('500');
        expect(body.toLowerCase()).not.toContain('internal server error');
      });
    }
  });
}

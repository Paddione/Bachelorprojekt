// tests/e2e/lib/sweep-guard.public.spec.ts
//
// Public-only, zero-auth validation of sweep-guard.ts. Loads the live mentolder
// homepage (WEBSITE_URL, default web.mentolder.de) in a fresh context with NO
// storageState — it can never mutate authenticated data. Proves the three
// safety/stability guarantees the visual sweep relies on.
//
// Run:
//   cd tests/e2e
//   WEBSITE_URL=https://web.mentolder.de npx playwright test \
//     --config=playwright.config.ts lib/sweep-guard.public.spec.ts --project=unit
//
// (The `unit` project's testDir is ./lib and matches *.test.ts; we pass the
//  file path explicitly so this *.public.spec.ts is picked up regardless.)

import { test, expect } from '@playwright/test';
import {
  installReadOnlyGuard,
  STABILITY_INIT_SCRIPT,
  applyStability,
  masksForRoute,
} from './sweep-guard';

const BASE = process.env.WEBSITE_URL || 'https://web.mentolder.de';

test('sweep-guard: anonymous homepage — read-only, no consent banner, fonts ready', async ({ browser }) => {
  // Fresh, unauthenticated context. No storageState => public reads only.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });

  // (a) Track EVERY request the browser attempts (guard aborts, but the
  //     'request' event still fires — that's exactly what we want to inspect).
  const nonReadRequests: string[] = [];
  context.on('request', (req) => {
    const m = req.method().toUpperCase();
    if (m !== 'GET' && m !== 'HEAD') {
      nonReadRequests.push(`${m} ${req.url()}`);
    }
  });

  await installReadOnlyGuard(context);
  await context.addInitScript(STABILITY_INIT_SCRIPT);

  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await applyStability(page);

  // (a) No mutating request escaped the browser.
  expect(
    nonReadRequests,
    `unexpected non-GET/HEAD requests:\n${nonReadRequests.join('\n')}`,
  ).toEqual([]);

  // (b) Consent banner is absent (init script pre-seeded cookie_consent_v1).
  //     The banner is role="region" aria-label="Cookie-Einstellungen".
  const banner = page.getByRole('region', { name: 'Cookie-Einstellungen' });
  await expect(banner).toHaveCount(0);

  // (c) document.fonts.ready resolved (truthy fonts API + resolved promise).
  const fontsReady = await page.evaluate(async () => {
    if (!(document as any).fonts) return false;
    await (document as any).fonts.ready;
    return (document as any).fonts.status === 'loaded';
  });
  expect(fontsReady).toBe(true);

  // Sanity: masksForRoute returns at least the media masks + homepage widgets.
  const masks = masksForRoute(page, '/');
  expect(masks.length).toBeGreaterThanOrEqual(3);

  // Optional artifact: a stabilized full-page screenshot with masks applied.
  await page.screenshot({
    path: '../results/visual-sweep/_guard-smoke/mentolder-home.png',
    fullPage: true,
    mask: masks,
  });

  await context.close();
});

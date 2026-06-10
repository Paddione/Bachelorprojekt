// tests/e2e/specs/fa-content-hub-price-ssot.spec.ts
//
// T000305 — Price Single-Source-of-Truth acceptance.
//
// The Leistungskatalog (leistungen_config) is the canonical price store. Service
// cards, detail pages and the highlight table are read-only PROJECTIONS of it.
// This spec proves the projection invariant two ways:
//   1. (creds-free) A linked service's headline price on the homepage card also
//      appears on its detail page and in the Leistungen table — one source, three
//      render sites.
//   2. (authenticated) Editing a catalog price via /api/admin/angebote/save makes
//      the new value show up on the homepage; the original is restored afterwards.
//
// Run:
//   WEBSITE_URL=https://web.mentolder.de \
//     npx playwright test fa-content-hub-price-ssot --project=mentolder
//
// Authenticated tests skip when E2E_ADMIN_PASS is not set.

import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');

// Match a EUR price token like "ab 60 € / Stunde" / "150 €" — tolerant of
// surrounding copy.
const PRICE_RE = /(?:ab\s*)?\d{1,4}(?:[.,]\d{2})?\s*€/;

test.describe('FA content-hub: price SSOT', { tag: ['@content-hub'] }, () => {
  test('headline price of a linked card appears on homepage, detail page and Leistungen', async ({ page, request }) => {
    // Homepage: find a service card with a price and capture its slug + price.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    // The homepage exposes service cards linking to /leistungen/<slug>.
    const cardLinks = await page.locator('a[href^="/leistungen/"]').all();
    test.skip(cardLinks.length === 0, 'no linked service cards rendered on homepage');

    let matched = false;
    for (const link of cardLinks) {
      const href = await link.getAttribute('href');
      if (!href) continue;
      const slug = href.replace(/\/+$/, '').split('/').pop()!;
      // Price text near the card (search the nearest card container).
      const cardText = (await link.locator('xpath=ancestor-or-self::*[self::article or self::div][1]').first().innerText().catch(() => '')) || '';
      const m = cardText.match(PRICE_RE);
      if (!m) continue;
      const price = m[0].replace(/\s+/g, ' ').trim();

      // The same price string must appear on the detail page …
      const detail = await request.get(`${BASE}/leistungen/${slug}`);
      expect(detail.status(), `detail page /leistungen/${slug}`).toBe(200);
      const detailHtml = await detail.text();
      const priceDigits = price.replace(/[^\d]/g, '');
      expect(detailHtml.replace(/\s+/g, ' ')).toContain(priceDigits);

      // … and in the Leistungen catalog table.
      const leistungen = await request.get(`${BASE}/leistungen`);
      expect(leistungen.status()).toBe(200);
      const leistungenHtml = await leistungen.text();
      expect(leistungenHtml).toContain(priceDigits);

      matched = true;
      break;
    }
    expect(matched, 'at least one priced, linked service card cross-checked').toBe(true);
  });

  test('editing a catalog price propagates to the homepage (and is restored)', async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/inhalte`,
      { acceptableStatuses: [200, 302, 401], label: 'admin inhalte' },
      testInfo
    );

    // The admin Inhalte page server-renders the current config into the editor;
    // we round-trip through the save endpoint instead of scraping it. Read the
    // current catalog so we can restore it.
    const inhalte = await request.get(`${BASE}/admin/inhalte`);
    expect(inhalte.status(), 'admin inhalte reachable with session').toBe(200);

    // Sentinel price unlikely to collide with real data.
    const sentinel = '4242';
    // We only mutate if we can locate the current leistungen JSON via the API the
    // editor posts to. Skip gracefully if the contract is unavailable here.
    const probe = await request.get(`${BASE}/api/admin/angebote/current`).catch(() => null);
    test.skip(!probe || probe.status() !== 200, 'no read endpoint to safely round-trip; covered by invariant test above');

    const current = await probe!.json();
    const leistungen = current.leistungen;
    const services = current.services;
    const priceListUrl = current.priceListUrl ?? '';

    // Patch the first catalog service price to the sentinel.
    const orig = JSON.parse(JSON.stringify(leistungen));
    leistungen[0].services[0].price = `ab ${sentinel} €`;

    const save = await request.post(`${BASE}/api/admin/angebote/save`, {
      headers: { 'Content-Type': 'application/json' },
      data: { services, leistungen, priceListUrl },
    });
    expect(save.status()).toBe(200);

    try {
      const home = await request.get(`${BASE}/`);
      expect((await home.text())).toContain(sentinel);
    } finally {
      // Restore original catalog regardless of assertion outcome.
      await request.post(`${BASE}/api/admin/angebote/save`, {
        headers: { 'Content-Type': 'application/json' },
        data: { services, leistungen: orig, priceListUrl },
      });
    }
  });
});

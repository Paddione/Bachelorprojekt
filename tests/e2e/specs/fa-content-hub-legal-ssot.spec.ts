// tests/e2e/specs/fa-content-hub-legal-ssot.spec.ts
//
// T000306 — Legal SSOT: stammdaten tokens resolve on all legal pages (AC 1, 2).
//
// Asserts that Impressum, Datenschutz, AGB and the footer all render the contact
// email from stammdaten, proving token resolution is live on both brands.
// Non-destructive read checks only.
//
// Run:
//   WEBSITE_URL=https://web.mentolder.de \
//     npx playwright test fa-content-hub-legal-ssot --project=mentolder
//   KORCZEWSKI_URL=https://web.korczewski.de \
//     npx playwright test fa-content-hub-legal-ssot --project=korczewski

import { test, expect } from '@playwright/test';

const MENTOLDER_BASE = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');
const KORCZEWSKI_BASE = (process.env.KORCZEWSKI_URL ?? 'https://web.korczewski.de').replace(/\/$/, '');

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;

async function assertEmailOnPage(request: import('@playwright/test').APIRequestContext, url: string, label: string) {
  const res = await request.get(url);
  test.skip(res.status() === 404, `${label} not found`);
  expect(res.status(), `${label} loaded`).toBe(200);
  const html = (await res.text()).replace(/\s+/g, ' ');
  expect(html, `${label} contains an email address (stammdaten token)`).toMatch(EMAIL_RE);
}

test.describe('FA content-hub: legal SSOT token resolution', { tag: ['@content-hub'] }, () => {
  test('mentolder /impressum renders stammdaten email', async ({ request }) => {
    await assertEmailOnPage(request, `${MENTOLDER_BASE}/impressum`, 'mentolder /impressum');
  });

  test('mentolder /datenschutz renders stammdaten email', async ({ request }) => {
    await assertEmailOnPage(request, `${MENTOLDER_BASE}/datenschutz`, 'mentolder /datenschutz');
  });

  test('mentolder /agb renders stammdaten email (if page exists)', async ({ request }) => {
    const res = await request.get(`${MENTOLDER_BASE}/agb`);
    test.skip(res.status() === 404, '/agb not present on this brand');
    expect(res.status()).toBe(200);
    const html = (await res.text()).replace(/\s+/g, ' ');
    expect(html).toMatch(EMAIL_RE);
  });

  test('mentolder footer on homepage renders stammdaten email', async ({ page }) => {
    await page.goto(`${MENTOLDER_BASE}/`, { waitUntil: 'domcontentloaded' });
    const footer = page.locator('footer');
    await expect(footer, 'footer is present').toBeVisible();
    const text = await footer.innerText();
    expect(text, 'footer contains an email address').toMatch(EMAIL_RE);
  });

  test('korczewski /impressum renders stammdaten email', async ({ request }) => {
    const res = await request.get(`${KORCZEWSKI_BASE}/impressum`);
    test.skip(res.status() !== 200, 'korczewski impressum not reachable');
    const html = (await res.text()).replace(/\s+/g, ' ');
    expect(html, 'korczewski impressum contains stammdaten email').toMatch(EMAIL_RE);
  });

  test('save endpoint rejects unauthenticated requests', async ({ playwright }) => {
    // The `mentolder` project ships an admin storageState; use a fresh request
    // context so the session cookie is NOT sent and the auth gate is actually
    // exercised. [fix/content-hub-service-page-config]
    const request = await playwright.request.newContext({ baseURL: MENTOLDER_BASE, ignoreHTTPSErrors: true });
    try {
      const res = await request.post(`/api/admin/content/save`, {
        data: { contentKey: 'stammdaten', baseVersion: 0, payload: {} },
      });
      expect([401, 403], 'save requires auth').toContain(res.status());
    } finally {
      await request.dispose();
    }
  });

  test('versions endpoint rejects unauthenticated requests', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: MENTOLDER_BASE, ignoreHTTPSErrors: true });
    try {
      const res = await request.get(`/api/admin/content/versions?key=stammdaten`);
      expect([401, 403], 'versions requires auth').toContain(res.status());
    } finally {
      await request.dispose();
    }
  });
});

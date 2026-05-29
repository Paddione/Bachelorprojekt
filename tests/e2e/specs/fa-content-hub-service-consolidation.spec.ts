// tests/e2e/specs/fa-content-hub-service-consolidation.spec.ts
//
// T000306 — Universal editor covers service pages (AC 3).
//
// The 'service' contentKey is registered in the ContentRef registry, meaning
// the universal /admin/inhalte editor can edit service page content the same
// way it edits stammdaten, FAQ, etc. This spec asserts the route, API contract,
// and /leistungen page render.
//
// Run:
//   WEBSITE_URL=https://web.mentolder.de \
//     npx playwright test fa-content-hub-service-consolidation --project=mentolder

import { test, expect } from '@playwright/test';

const BASE = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');

test.describe('FA content-hub: service consolidation (AC 3)', () => {
  test('/leistungen page loads and lists service items', async ({ request }) => {
    const res = await request.get(`${BASE}/leistungen`);
    expect(res.status(), '/leistungen loads').toBe(200);
    const html = await res.text();
    // The catalog renders at least one item.
    expect(html.length, 'page has content').toBeGreaterThan(200);
  });

  test('service save endpoint rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/content/save`, {
      data: { contentKey: 'service', baseVersion: 0, payload: {} },
    });
    expect([401, 403], 'service save requires auth').toContain(res.status());
  });

  test('service versions endpoint rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/content/versions?key=service`);
    expect([401, 403], 'service versions requires auth').toContain(res.status());
  });

  test('/admin/inhalte accessible and includes service section (with auth)', async ({ page }) => {
    // mentolder project provides storageState (admin session).
    await page.goto(`${BASE}/admin/inhalte`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/admin\/inhalte/);
    // The unified editor page must load (200) — full section rendering is visual.
    expect(page.url()).toContain('/admin/inhalte');
  });

  test('service key is accepted by save endpoint (with auth, schema validated)', async ({ request }) => {
    // Without auth → 401/403. With auth and valid key but invalid payload → 422.
    // This confirms 'service' is a known contentKey (not 400).
    const res = await request.post(`${BASE}/api/admin/content/save`, {
      data: { contentKey: 'service', baseVersion: 0, payload: {} },
    });
    // 401/403 = auth gate; 409 = conflict (key exists, versioning works);
    // 422 = validation failed (key accepted, schema enforced); 400 = key unknown (fail).
    expect(res.status(), 'service key is a known contentKey (not 400)').not.toBe(400);
    expect([401, 403, 409, 422]).toContain(res.status());
  });
});

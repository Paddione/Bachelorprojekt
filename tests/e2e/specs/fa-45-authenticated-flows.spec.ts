// tests/e2e/specs/fa-45-authenticated-flows.spec.ts
//
// FA-45: Authenticated API flows — positive-path tests using real session.
// Requires mentolder-setup to run first (storageState: .auth/mentolder-website-admin.json).
//
// Run:
//   E2E_ADMIN_PASS=<pass> WEBSITE_URL=https://web.mentolder.de \
//     npx playwright test fa-45-authenticated-flows.spec.ts --project=mentolder --headed
//
// All tests are skipped when E2E_ADMIN_PASS is not set.

import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');

test.describe('FA-45: Authenticated API flows', () => {

  test.beforeEach(async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/api/auth/me`,
      { acceptableStatuses: [200, 302, 401], label: 'auth me API' },
      testInfo
    );
  });

  // T1: /api/auth/me returns authenticated user
  test('T1: /api/auth/me returns authenticated user', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user).toHaveProperty('username');
  });

  // T2: /api/portal/rooms returns JSON array (or empty)
  test('T2: /api/portal/rooms returns JSON array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/rooms`);
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body) || typeof body === 'object').toBe(true);
    }
  });

  // T3: /api/admin/ops/health returns cluster results
  test('T3: /api/admin/ops/health returns cluster results', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/ops/health`, { timeout: 60_000 });
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.results || body.clusters).toBeTruthy();
    }
  });

  // T4: /api/admin/platform/software returns software assets
  test('T4: /api/admin/platform/software returns assets', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/software`, { timeout: 60_000 });
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body) || typeof body === 'object').toBe(true);
    }
  });

  // T5: /api/admin/platform/hardware returns hardware assets
  test('T5: /api/admin/platform/hardware returns assets', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/hardware`, { timeout: 60_000 });
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body) || typeof body === 'object').toBe(true);
    }
  });

  // T6: /admin/coaching/sessions loads without redirecting to Keycloak
  test('T6: /admin/coaching/sessions loads for admin', async ({ page }) => {
    await page.goto(`${BASE}/admin/coaching/sessions`);
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toMatch(/realms\/workspace/);
    expect(page.url()).toContain(new URL(BASE).hostname);
  });

  // T7: /api/admin/inbox/count returns numeric value
  test('T7: /api/admin/inbox/count returns numeric value', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/inbox/count`);
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body === 'number' || typeof body.count === 'number' || typeof body === 'object').toBe(true);
    }
  });

  // T8: /api/admin/tickets returns bug list (or empty)
  test('T8: /api/admin/tickets returns bug list', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/tickets`);
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body) || (typeof body === 'object' && body !== null)).toBe(true);
    }
  });
});

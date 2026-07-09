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
    expect(body).toHaveProperty('username');
  });

  // T2: /api/portal/rooms returns JSON array (or empty)
  test('T2: /api/portal/rooms returns JSON array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/rooms`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // T3: /api/admin/ops/health returns cluster results
  test('T3: /api/admin/ops/health returns cluster results', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/ops/health`, { timeout: 60_000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should have at least one cluster result
    expect(body).toHaveProperty('clusters');
    expect(Array.isArray(body.clusters)).toBe(true);
    expect(body.clusters.length).toBeGreaterThan(0);
  });

  // T4: /api/admin/platform/software returns software assets
  test('T4: /api/admin/platform/software returns assets', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/software`, { timeout: 60_000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should contain some software entries
    expect(Array.isArray(body)).toBe(true);
  });

  // T5: /portal page loads without redirect to login
  test('T5: /portal page loads without redirect', async ({ page }) => {
    await page.goto(`${BASE}/portal`, { waitUntil: 'domcontentloaded' });
    // Should NOT redirect to /api/auth/login or Keycloak
    expect(page.url()).not.toMatch(/api\/auth\/login/);
    expect(page.url()).not.toMatch(/realms\/workspace/);
    // Must stay on the website domain
    expect(page.url()).toContain(new URL(BASE).hostname);
  });

  // T6: /admin page loads without redirect
  test('T6: /admin page loads without redirect', async ({ page }) => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    expect(page.url()).not.toMatch(/api\/auth\/login/);
    expect(page.url()).not.toMatch(/realms\/workspace/);
    expect(page.url()).toContain(new URL(BASE).hostname);
  });

  // T7: /api/admin/inbox/count returns numeric value
  test('T7: /api/admin/inbox/count returns numeric value', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/inbox/count`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.count === 'number' || typeof body === 'number').toBe(true);
  });

  // T8: /api/admin/bugs returns bug list (or empty)
  test('T8: /api/admin/bugs returns bug list', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/bugs`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) || (typeof body === 'object' && body !== null)).toBe(true);
  });
});

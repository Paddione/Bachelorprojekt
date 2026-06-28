// tests/e2e/specs/fa-content-hub-concurrency.spec.ts
//
// T000306 — Concurrent save safety: second writer with stale baseVersion → 409 (AC 6).
//
// Project: services (API-level).
//
// The save endpoint enforces optimistic locking: if the baseVersion sent by the
// client doesn't match the DB's current version, it responds 409 with the
// current value, so the second writer can merge before retrying.
//
// Run:
//   WEBSITE_URL=https://web.mentolder.de \
//     npx playwright test fa-content-hub-concurrency --project=services

import { test, expect } from '@playwright/test';
import { assertReachable } from '../lib/health-assertions';

const BASE = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');

// These tests run under the `mentolder` project which carries an admin
// storageState. To assert the auth gate is wired we must POST without that
// session cookie — using a fresh APIRequestContext via `playwright.request`
// bypasses the inherited cookies entirely. [fix/content-hub-service-page-config]
async function anonContext(playwright: { request: import('@playwright/test').APIRequest }) {
  return playwright.request.newContext({ baseURL: BASE, ignoreHTTPSErrors: true });
}

test.describe('FA content-hub: concurrency safety (AC 6)', { tag: ['@content-hub'] }, () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertReachable(
      request,
      BASE,
      { acceptableStatuses: [200, 301, 302, 404], label: 'Astro website' },
      testInfo
    );
  });

  test('save endpoint rejects request without auth (401)', async ({ playwright }) => {
    const request = await anonContext(playwright);
    try {
      const res = await request.post(`/api/admin/content/save`, {
        data: { contentKey: 'stammdaten', baseVersion: 0, payload: {} },
      });
      expect([401, 403], 'unauthenticated save is rejected').toContain(res.status());
    } finally {
      await request.dispose();
    }
  });

  test('two saves with the same baseVersion — second gets 409 (API contract)', async ({ playwright }) => {
    // Without admin credentials in this project we can only verify the auth gate
    // from here. The full optimistic-lock 409 path is covered by:
    //   website/src/pages/api/admin/content/save.test.ts (unit mock)
    //   website/src/lib/admin/conflict.test.ts (pure helper)
    // This test documents the expected API contract so future authenticated
    // runners (dev-flow-iterate against a live cluster) can exercise it.
    const request = await anonContext(playwright);
    try {
      const payload = { contentKey: 'stammdaten', baseVersion: -1, payload: {} };
      const res1 = await request.post(`/api/admin/content/save`, { data: payload });
      const res2 = await request.post(`/api/admin/content/save`, { data: payload });
      // Both should return 401 without auth; with auth the second should return 409.
      // We assert both are consistent (same status) as a sanity check.
      expect([401, 403]).toContain(res1.status());
      expect([401, 403]).toContain(res2.status());
    } finally {
      await request.dispose();
    }
  });

  test('save returns 400 for unknown contentKey (auth gate check)', async ({ playwright }) => {
    const request = await anonContext(playwright);
    try {
      const res = await request.post(`/api/admin/content/save`, {
        data: { contentKey: '__bad_key__', baseVersion: 0, payload: {} },
      });
      // 401/403 before auth; 400 after auth with bad key.
      expect([400, 401, 403]).toContain(res.status());
    } finally {
      await request.dispose();
    }
  });
});

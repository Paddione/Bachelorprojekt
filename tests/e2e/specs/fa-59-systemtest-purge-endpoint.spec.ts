// tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts
//
// FA-59 — Systemtest purge endpoint preservation in build-target integration [T002728].
//
// Verifies that systemtest infrastructure routes under /sdlc/api/systemtest/ (e.g. purge-all-test-data, cleanup-fixtures)
// are preserved by build-target integration across environments and respond cleanly (e.g. 401/405/200, not 404).

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

test.describe('FA-59: Systemtest purge endpoint preservation', { tag: ['@smoke', '@website'] }, () => {
  test('T1: /sdlc/api/systemtest/purge-all-test-data route is preserved and reachable (not 404)', async ({ request }) => {
    // Attempting a request to the purge endpoint
    const response = await request.post(`${BASE}/sdlc/api/systemtest/purge-all-test-data`);
    
    // The route must exist and be preserved by build-target (so should not return 404)
    expect(response.status()).not.toBe(404);
  });

  test('T2: /sdlc/api/systemtest/cleanup-fixtures route is preserved and reachable (not 404)', async ({ request }) => {
    const response = await request.post(`${BASE}/sdlc/api/systemtest/cleanup-fixtures`);
    
    // The route must exist and be preserved by build-target (so should not return 404)
    expect(response.status()).not.toBe(404);
  });
});

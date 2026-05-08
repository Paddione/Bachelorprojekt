// tests/e2e/specs/global-db-cleanup.ts
//
// Playwright globalSetup + globalTeardown that brackets every Playwright run
// with a hard test-data purge against the prod website DB. Both hooks call
// POST /api/admin/systemtest/purge-all-test-data with the X-Cron-Secret
// header that the in-cluster CRON_SECRET also uses.
//
// Wired in tests/e2e/playwright.config.ts as:
//   globalSetup:    require.resolve('./specs/global-db-cleanup.ts')
//   globalTeardown: require.resolve('./specs/global-db-cleanup.ts')
//
// Playwright supports a single file exporting both hooks: the runner calls
// `default` once at suite start and `teardown` once at suite end.
//
// Failure policy: BOTH hooks throw on any non-2xx response. We *want* the
// run to fail loudly if the purge endpoint is broken — silently skipping
// would let test-data accumulate undetected, which is exactly the regression
// this infrastructure exists to prevent.
//
// The Taskfile wraps `npx playwright test` with curl calls to the same
// endpoint as defense-in-depth (in case Playwright crashes before reaching
// globalTeardown), with `|| true` after the test command so an extra failure
// doesn't mask a real test failure.

import type { FullConfig } from '@playwright/test';

const PURGE_PATH = '/api/admin/systemtest/purge-all-test-data';

function purgeUrl(): string {
  // Prefer the dedicated E2E_BASE_URL override, then fall back to WEBSITE_URL
  // (set by the Taskfile based on ENV=mentolder|korczewski), then prod.
  const base = process.env.E2E_BASE_URL
    || process.env.WEBSITE_URL
    || 'https://web.mentolder.de';
  return base.replace(/\/+$/, '') + PURGE_PATH;
}

async function callPurge(label: 'setup' | 'teardown'): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error(
      `[global-db-cleanup:${label}] CRON_SECRET not set — cannot bracket Playwright run with prod DB purge`,
    );
  }
  const url = purgeUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Cron-Secret': secret },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `[global-db-cleanup:${label}] POST ${url} → ${res.status}: ${text.slice(0, 500)}`,
    );
  }
  // Best-effort log of the per-table counts. The endpoint returns
  // { ok: true, counts: {...} } on success.
  let counts: unknown = null;
  try { counts = JSON.parse(text); } catch { counts = text; }
  // eslint-disable-next-line no-console
  console.log(`[global-db-cleanup:${label}] ${url} ← 200`, counts);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await callPurge('setup');
}

export async function teardown(_config: FullConfig): Promise<void> {
  await callPurge('teardown');
}

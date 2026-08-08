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
// The Taskfile wraps `playwright test` with curl calls to the same
// endpoint as defense-in-depth (in case Playwright crashes before reaching
// globalTeardown), with `|| true` after the test command so an extra failure
// doesn't mask a real test failure.

import type { FullConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';

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
  // Allow pure-unit / offline runs to skip the prod DB purge entirely.
  if (process.env.SKIP_DB_PURGE === '1') {
    // eslint-disable-next-line no-console
    console.log(`[global-db-cleanup:${label}] SKIP_DB_PURGE=1 — skipping prod DB purge`);
    return;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.log(`[global-db-cleanup:${label}] CRON_SECRET not set — skipping prod DB purge (offline/unit run)`);
    return;
  }
  const url = purgeUrl();
  
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'X-Cron-Secret': secret },
    });
  } catch (err) {
    // Handle network errors (DNS resolution, connection refused, etc.)
    // Don't throw — log warning and continue. The test suite should still
    // run even if the purge endpoint is unreachable from CI runners.
    const errMsg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[global-db-cleanup:${label}] ⚠ Network error calling ${url}: ${errMsg}`);
    // eslint-disable-next-line no-console
    console.warn(`[global-db-cleanup:${label}] Continuing without prod DB purge.`);
    return;
  }
  
  const text = await res.text();
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(
      `[global-db-cleanup:${label}] ⚠ POST ${url} → ${res.status}: ${text.slice(0, 500)}`,
    );
    // eslint-disable-next-line no-console
    console.warn(`[global-db-cleanup:${label}] Continuing without prod DB purge.`);
    return;
  }
  // Best-effort log of the per-table counts. The endpoint returns
  // { ok: true, counts: {...} } on success.
  let counts: unknown = null;
  try { counts = JSON.parse(text); } catch { counts = text; }
  // eslint-disable-next-line no-console
  console.log(`[global-db-cleanup:${label}] ${url} ← 200`, counts);
}

// ── Deploy-drift detection (T002202) ─────────────────────────────────────────
//
// A run against prod measures two things at once: the code and the deploy
// state. On 2026-07-26 a nightly run filed T002192 against /api/poll/:id
// returning HTML on 404 — the source on main set Content-Type: application/json
// the whole time, only the deployed build lagged. The ticket described a bug
// that never existed in the repository.
//
// This warns and continues rather than throwing. Flux reconciles every 10
// minutes, so drift is frequently transient; aborting would forfeit an entire
// nightly run — including the trend and flake data, which stays valid under
// drift — over a deploy that was a few minutes behind. The authoritative gate
// lives server-side in /api/admin/tests/ingest-e2e, which knows its own build
// SHA and refuses to open tickets for a drifted run.

function healthUrl(): string {
  const base = process.env.E2E_BASE_URL
    || process.env.WEBSITE_URL
    || 'https://web.mentolder.de';
  return base.replace(/\/+$/, '') + '/api/health';
}

/** SHA under test: GITHUB_SHA in CI, the local HEAD otherwise. */
function testedSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function reportDeployDrift(): Promise<void> {
  if (process.env.SKIP_DRIFT_CHECK === '1') return;

  const url = healthUrl();
  let deployed = 'unknown';
  try {
    const res = await fetch(url);
    if (res.ok) {
      const body = await res.json() as { commit?: string };
      // A missing field must not read as "no drift" — keep it 'unknown'.
      deployed = (body?.commit ?? '').trim() || 'unknown';
    }
  } catch {
    // Unreachable health endpoint is treated as unknown, not as absence of
    // drift. Failing open here would defeat the whole point.
    deployed = 'unknown';
  }

  const tested = testedSha();
  const norm = (s: string) => s.trim().toLowerCase();
  const drifted =
    !norm(tested) || !norm(deployed)
    || norm(tested) === 'unknown' || norm(deployed) === 'unknown'
    || norm(tested) !== norm(deployed);

  if (!drifted) {
    // eslint-disable-next-line no-console
    console.log(`[deploy-drift] deployed commit matches tested SHA (${tested})`);
    return;
  }

  /* eslint-disable no-console */
  console.warn('');
  console.warn('  ⚠  DEPLOY_DRIFT — this run does not measure the code under test alone.');
  console.warn(`     tested   = ${tested}`);
  console.warn(`     deployed = ${deployed}  (${url})`);
  console.warn('     Failures from this run are NOT attributable to the source tree');
  console.warn('     and will not be auto-ticketed by the ingest endpoint.');
  console.warn('');
  /* eslint-enable no-console */
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await callPurge('setup');
  await reportDeployDrift();
}

export async function teardown(_config: FullConfig): Promise<void> {
  await callPurge('teardown');
}

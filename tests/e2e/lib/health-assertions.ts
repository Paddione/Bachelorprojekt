// tests/e2e/lib/health-assertions.ts
//
// Central health-check assertions for E2E tests.
// In production (PROD_DOMAIN set): unreachable services cause HARD FAILURES.
// In dev (no PROD_DOMAIN): unreachable services call test.fixme() — visible
// but non-blocking.

import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { test } from '@playwright/test';

// ── Mode detection ─────────────────────────────────────────────────────────

function isProd(): boolean {
  return !!process.env.PROD_DOMAIN;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ReachableOpts {
  /** HTTP statuses considered "reachable" (default: [200]) */
  acceptableStatuses?: number[];
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** When true, 404 → test.fixme("not deployed") instead of failure */
  allow404AsNotDeployed?: boolean;
  /** Label for the service in error messages (e.g. "DocuSeal") */
  label?: string;
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
}

export interface HealthResult {
  ok: boolean;
  reason?: string;
}

export type HealthCheck = (response: APIResponse) => Promise<HealthResult>;

// ── Helpers ────────────────────────────────────────────────────────────────

function modeLabel(): string {
  return isProd() ? 'prod' : 'dev';
}

function skipOrFail(testInfo: TestInfo | undefined, message: string): never {
  if (isProd()) {
    throw new Error(`E2E HEALTH CHECK FAILED [prod]: ${message}`);
  }
  // In dev, use test.fixme so the skip is visible in the report
  const fixme = testInfo?.fixme || test.fixme;
  (fixme as (shouldFix: boolean, reason: string) => void)(true, `[${modeLabel()}] ${message}`);
  // test.fixme() throws internally in Playwright — the throw below is a
  // safety net in case the test runner hasn't set up the fixme infrastructure.
  throw new Error(`__PLAYWRIGHT_FIXME__: [${modeLabel()}] ${message}`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Assert that an HTTP endpoint is reachable.
 *
 * In production: unreachable → hard failure.
 * In dev: unreachable → test.fixme() (visible in report, not silently green).
 *
 * Returns the APIResponse on success so callers can assert on the body.
 */
export async function assertReachable(
  request: APIRequestContext,
  url: string,
  opts: ReachableOpts = {},
  testInfo?: TestInfo
): Promise<APIResponse> {
  const {
    acceptableStatuses = [200],
    timeout = 10_000,
    allow404AsNotDeployed = false,
    label = url,
  } = opts;

  let res: APIResponse;
  try {
    const method = (opts.method || 'GET').toLowerCase() as 'get' | 'post';
    if (method === 'post') {
      res = await request.post(url, { timeout });
    } else {
      res = await request.get(url, { timeout });
    }
  } catch (err: any) {
    const detail = err?.message || String(err);
    skipOrFail(testInfo, `${label}: request failed — ${detail}`);
  }

  if (allow404AsNotDeployed && res.status() === 404) {
    skipOrFail(testInfo, `${label}: service not deployed (404)`);
  }

  if (!acceptableStatuses.includes(res.status())) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    const snippet = body.substring(0, 200);
    skipOrFail(
      testInfo,
      `${label}: expected status ${acceptableStatuses.join('/')}, got ${res.status()} — body: ${snippet}`
    );
  }

  return res;
}

/**
 * Assert that an authenticated endpoint is reachable.
 *
 * First checks that E2E_ADMIN_PASS is set. Then delegates to assertReachable.
 * Use for any test that requires admin authentication.
 */
export async function assertAuthenticatedReachable(
  request: APIRequestContext,
  url: string,
  opts: ReachableOpts = {},
  testInfo?: TestInfo
): Promise<APIResponse> {
  const adminPass = process.env.E2E_ADMIN_PASS;
  if (!adminPass) {
    skipOrFail(
      testInfo,
      `E2E_ADMIN_PASS not set — cannot reach authenticated endpoint: ${url}`
    );
  }
  return assertReachable(request, url, opts, testInfo);
}

/**
 * Assert that a service is reachable AND passes a health check.
 *
 * Example:
 *   await assertHealth(request, 'https://files.example.com/status.php', testInfo,
 *     async (res) => {
 *       const body = await res.json();
 *       return { ok: body.installed === true, reason: body.installed ? undefined : 'not installed' };
 *     }
 *   );
 */
export async function assertHealth(
  request: APIRequestContext,
  url: string,
  check: HealthCheck,
  opts: ReachableOpts = {},
  testInfo?: TestInfo
): Promise<void> {
  const res = await assertReachable(request, url, opts, testInfo);
  const result = await check(res);
  if (!result.ok) {
    skipOrFail(
      testInfo,
      `${opts.label || url}: health check failed — ${result.reason || 'unknown'}`
    );
  }
}

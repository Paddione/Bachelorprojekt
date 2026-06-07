# E2E Green-on-Skip beheben — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematisches Green-on-Skip-Muster in der Playwright-E2E-Suite beheben: zentrale Health-Assertion-Bibliothek einführen, `E2E_ADMIN_PASS` in CI provisionieren, 167 konditionale Skips auf `assertReachable`/`test.fixme` migrieren, Integration-Smoke h"arten.

**Architecture:** Neue `health-assertions.ts` Bibliothek als Single-Point-of-Truth f"ur Erreichbarkeitspr"ufungen. Modus-Unterscheidung via `!!PROD_DOMAIN`: Prod → Hard-Failure, Dev → `test.fixme()`. Bestehende Auth-Setup-Specs um Assertion-Wrapper erg"anzt. Mechanische Migration aller Skip-Patterns auf die neuen Assertions.

**Tech Stack:** TypeScript, Playwright Test, GitHub Actions (e2e.yml)

**Spec:** `docs/superpowers/specs/2026-06-07-e2e-green-on-skip-fix-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `tests/e2e/lib/health-assertions.ts` | **NEW** — Core assertion library (assertReachable, assertAuthenticatedReachable, assertHealth) |
| `tests/e2e/lib/health-assertions.test.ts` | **NEW** — Unit tests for the assertion library |
| `.github/workflows/e2e.yml` | CI workflow — add E2E_ADMIN_PASS provisioning |
| `tests/e2e/specs/mentolder-auth-setup.spec.ts` | Replace manual E2E_ADMIN_PASS check with assertAuthenticatedReachable |
| `tests/e2e/specs/arena-mentolder-auth-setup.spec.ts` | Same — use shared assertion |
| `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts` | Add real Keycloak login, use shared assertion |
| `tests/e2e/specs/korczewski-auth-setup.spec.ts` | Same — use shared assertion |
| `tests/e2e/specs/integration-smoke.spec.ts` | Harden: strict status assertions, allow404AsNotDeployed |
| `tests/e2e/specs/fa-27-brett.spec.ts` | Remove 11 PROD_DOMAIN skips |
| `tests/e2e/specs/fa-03-video.spec.ts` | 503 → test.fixme |
| `tests/e2e/specs/fa-18-transcription.spec.ts` | test.skip → test.fixme |
| `tests/e2e/specs/fa-livekit.spec.ts` | Transport-Error → assertReachable |
| `tests/e2e/specs/fa-content-hub-concurrency.spec.ts` | Transport-Error → assertReachable |
| `tests/e2e/helpers/billing.ts` | Use assertAuthenticatedReachable |
| ~30 admin spec files | Replace test.skip(!ADMIN_PASS) pattern |
| ~5 hard-skip files | test.skip(true) → test.fixme(true) |

---

## Phase 1: Foundation

### Task 1: Create health-assertions.ts library

**Files:**
- Create: `tests/e2e/lib/health-assertions.ts`

- [ ] **Step 1: Write the library**

```typescript
// tests/e2e/lib/health-assertions.ts
//
// Central health-check assertions for E2E tests.
// In production (PROD_DOMAIN set): unreachable services cause HARD FAILURES.
// In dev (no PROD_DOMAIN): unreachable services call test.fixme() — visible
// but non-blocking.

import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { test } from '@playwright/test';

// ── Mode detection ─────────────────────────────────────────────────────────

const IS_PROD = !!process.env.PROD_DOMAIN;

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
}

export interface HealthResult {
  ok: boolean;
  reason?: string;
}

export type HealthCheck = (response: APIResponse) => Promise<HealthResult>;

// ── Helpers ────────────────────────────────────────────────────────────────

function modeLabel(): string {
  return IS_PROD ? 'prod' : 'dev';
}

function skipOrFail(testInfo: TestInfo | undefined, message: string): never {
  if (IS_PROD) {
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
    res = await request.get(url, { timeout });
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
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/lib/health-assertions.ts
git commit -m "feat(e2e): add health-assertions library (T000480)

assertReachable / assertAuthenticatedReachable / assertHealth
Prod mode (PROD_DOMAIN) → hard failure. Dev → test.fixme()"
```

---

### Task 2: Write unit tests for health-assertions

**Files:**
- Create: `tests/e2e/lib/health-assertions.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/e2e/lib/health-assertions.test.ts
//
// Unit tests for the health-assertions library.
// Uses Playwright's built-in test runner with a mock APIRequestContext.

import { test, expect } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import {
  assertReachable,
  assertAuthenticatedReachable,
  assertHealth,
} from './health-assertions';

// ── Mock helpers ───────────────────────────────────────────────────────────

function mockResponse(status: number, body: string = ''): APIResponse {
  return {
    status: () => status,
    ok: () => status >= 200 && status < 300,
    text: async () => body,
    json: async () => JSON.parse(body || '{}'),
    headers: () => ({}),
    url: () => 'https://test.local',
    headersArray: () => [],
    body: async () => Buffer.from(body),
  } as unknown as APIResponse;
}

function mockRequest(handler: (url: string) => APIResponse): APIRequestContext {
  return {
    get: async (url: string) => handler(url),
    post: async () => mockResponse(200),
    put: async () => mockResponse(200),
    delete: async () => mockResponse(200),
    patch: async () => mockResponse(200),
    head: async () => mockResponse(200),
    fetch: async () => mockResponse(200),
    storageState: async () => ({}),
  } as unknown as APIRequestContext;
}

function mockRequestThatThrows(error: Error): APIRequestContext {
  return {
    get: async () => { throw error; },
  } as unknown as APIRequestContext;
}

// ── assertReachable ────────────────────────────────────────────────────────

test.describe('assertReachable', () => {

  test('200 → returns response', async () => {
    const request = mockRequest(() => mockResponse(200, 'ok'));
    const res = await assertReachable(request, 'https://ok.local');
    expect(res.status()).toBe(200);
  });

  test('acceptableStatuses [200,302] → 302 passes', async () => {
    const request = mockRequest(() => mockResponse(302, ''));
    const res = await assertReachable(request, 'https://redirect.local', {
      acceptableStatuses: [200, 302],
    });
    expect(res.status()).toBe(302);
  });

  test('unexpected status → throws in production', async () => {
    const oldDomain = process.env.PROD_DOMAIN;
    process.env.PROD_DOMAIN = 'example.com';
    try {
      const request = mockRequest(() => mockResponse(503, 'unavailable'));
      await assertReachable(request, 'https://down.local');
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('E2E HEALTH CHECK FAILED [prod]');
      expect(err.message).toContain('unavailable');
    } finally {
      if (oldDomain) process.env.PROD_DOMAIN = oldDomain;
      else delete process.env.PROD_DOMAIN;
    }
  });

  test('allow404AsNotDeployed: 404 → fixme', async () => {
    // In dev mode (no PROD_DOMAIN), 404 → fixme
    const request = mockRequest(() => mockResponse(404, ''));
    try {
      await assertReachable(request, 'https://not-deployed.local', {
        allow404AsNotDeployed: true,
      });
    } catch (err: any) {
      // test.fixme() throws internally — expected in dev
      expect(err.message).toContain('__PLAYWRIGHT_FIXME__');
    }
  });

  test('allow404AsNotDeployed: 404 in prod → hard fail', async () => {
    const oldDomain = process.env.PROD_DOMAIN;
    process.env.PROD_DOMAIN = 'example.com';
    try {
      const request = mockRequest(() => mockResponse(404, ''));
      await assertReachable(request, 'https://not-deployed.local', {
        allow404AsNotDeployed: true,
      });
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('E2E HEALTH CHECK FAILED [prod]');
    } finally {
      if (oldDomain) process.env.PROD_DOMAIN = oldDomain;
      else delete process.env.PROD_DOMAIN;
    }
  });

  test('network error → fixme in dev', async () => {
    const request = mockRequestThatThrows(new Error('ECONNREFUSED'));
    try {
      await assertReachable(request, 'https://crash.local');
    } catch (err: any) {
      expect(err.message).toContain('__PLAYWRIGHT_FIXME__');
      expect(err.message).toContain('ECONNREFUSED');
    }
  });

  test('network error → hard fail in prod', async () => {
    const oldDomain = process.env.PROD_DOMAIN;
    process.env.PROD_DOMAIN = 'example.com';
    try {
      const request = mockRequestThatThrows(new Error('ECONNREFUSED'));
      await assertReachable(request, 'https://crash.local');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('E2E HEALTH CHECK FAILED [prod]');
    } finally {
      if (oldDomain) process.env.PROD_DOMAIN = oldDomain;
      else delete process.env.PROD_DOMAIN;
    }
  });
});

// ── assertAuthenticatedReachable ────────────────────────────────────────────

test.describe('assertAuthenticatedReachable', () => {

  test('without E2E_ADMIN_PASS → fixme/fail', async () => {
    const oldPass = process.env.E2E_ADMIN_PASS;
    delete process.env.E2E_ADMIN_PASS;
    try {
      const request = mockRequest(() => mockResponse(200, 'ok'));
      await assertAuthenticatedReachable(request, 'https://admin.local');
    } catch (err: any) {
      expect(err.message).toContain('E2E_ADMIN_PASS not set');
    } finally {
      if (oldPass) process.env.E2E_ADMIN_PASS = oldPass;
    }
  });

  test('with E2E_ADMIN_PASS → calls assertReachable', async () => {
    const oldPass = process.env.E2E_ADMIN_PASS;
    process.env.E2E_ADMIN_PASS = 'test123';
    try {
      const request = mockRequest(() => mockResponse(200, 'ok'));
      const res = await assertAuthenticatedReachable(request, 'https://admin.local');
      expect(res.status()).toBe(200);
    } finally {
      if (oldPass) process.env.E2E_ADMIN_PASS = oldPass;
      else delete process.env.E2E_ADMIN_PASS;
    }
  });
});

// ── assertHealth ────────────────────────────────────────────────────────────

test.describe('assertHealth', () => {

  test('passing health check → resolves', async () => {
    const request = mockRequest(() => mockResponse(200, '{"installed":true}'));
    await assertHealth(
      request,
      'https://files.local/status.php',
      async (res) => {
        const body = await res.json();
        return { ok: body.installed === true };
      },
      {},
      undefined
    );
    // Should not throw
  });

  test('failing health check → fails', async () => {
    const request = mockRequest(() => mockResponse(200, '{"installed":false}'));
    try {
      await assertHealth(
        request,
        'https://files.local/status.php',
        async (res) => {
          const body = await res.json();
          return { ok: body.installed === true, reason: 'maintenance mode' };
        },
        {},
        undefined
      );
    } catch (err: any) {
      expect(err.message).toContain('maintenance mode');
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
cd tests/e2e && npx playwright test lib/health-assertions.test.ts
```
Expected: All tests pass (dev-mode assertions exercise fixme paths).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/lib/health-assertions.test.ts
git commit -m "test(e2e): add health-assertions unit tests (T000480)"
```

---

### Task 3: Provision E2E_ADMIN_PASS in CI

**Files:**
- Modify: `.github/workflows/e2e.yml:106-110`

- [ ] **Step 1: Add E2E_ADMIN_PASS to e2e.yml**

In `.github/workflows/e2e.yml`, add after line 110 (the `SKIP_DB_PURGE` line):

```yaml
          # Admin auth for E2E suite (T000480 — was missing, caused 35+ specs to silently skip)
          E2E_ADMIN_USER: paddione
          E2E_ADMIN_PASS: ${{ secrets.E2E_ADMIN_PASS }}
```

The resulting env block (lines 85–113) becomes:

```yaml
        env:
          # Primary URLs
          WEBSITE_URL: ${{ matrix.website_url }}
          PROD_DOMAIN: ${{ matrix.prod_domain }}
          # Per-service URL overrides
          TEST_KC_URL: https://auth.${{ matrix.prod_domain }}
          TEST_NC_URL: https://files.${{ matrix.prod_domain }}
          TEST_SIGNALING_URL: https://signaling.${{ matrix.prod_domain }}
          NC_DOMAIN: files.${{ matrix.prod_domain }}
          SIGNALING_DOMAIN: signaling.${{ matrix.prod_domain }}
          VAULT_URL: https://vault.${{ matrix.prod_domain }}
          MAIL_URL: https://mail.${{ matrix.prod_domain }}
          BOARD_URL: https://board.${{ matrix.prod_domain }}
          BRETT_URL: https://brett.${{ matrix.prod_domain }}
          TRACKING_URL: https://tracking.${{ matrix.prod_domain }}
          DASHBOARD_URL: https://dashboard.${{ matrix.prod_domain }}
          # Per-cluster brand assertions
          CONTACT_EMAIL: ${{ matrix.contact_email }}
          CONTACT_PHONE: ${{ matrix.contact_phone }}
          # Auth
          MM_TEST_USER: ${{ secrets.MM_TEST_USER }}
          MM_TEST_PASS: ${{ secrets.MM_TEST_PASS }}
          # Admin auth for E2E suite (T000480 — was missing, caused 35+ specs to silently skip)
          E2E_ADMIN_USER: paddione
          E2E_ADMIN_PASS: ${{ secrets.E2E_ADMIN_PASS }}
          # Skip prod DB purge until CRON_SECRET is provisioned as a repo secret (T000408).
          SKIP_DB_PURGE: "1"
```

- [ ] **Step 2: Create the GitHub secret (manual step)**

**PREREQUISITE before merging:** Das Secret `E2E_ADMIN_PASS` muss in den Repository-Secrets existieren.
Falls nicht vorhanden: in GitHub → Settings → Secrets and variables → Actions → New repository secret.
Name: `E2E_ADMIN_PASS`, Value: das Keycloak-Passwort f"ur `paddione`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci(e2e): provision E2E_ADMIN_PASS in e2e.yml (T000480)

Was missing — caused mentolder-auth-setup to write empty storageState
and 35+ admin specs to silently skip in CI."
```

---

## Phase 2: Auth Setup Specs

### Task 4: Update mentolder-auth-setup to use health-assertions

**Files:**
- Modify: `tests/e2e/specs/mentolder-auth-setup.spec.ts:23,39-43`

- [ ] **Step 1: Replace manual E2E_ADMIN_PASS check**

In `mentolder-auth-setup.spec.ts`, replace the manual check with an import-based approach:

```typescript
// tests/e2e/specs/mentolder-auth-setup.spec.ts
//
// ... (keep existing header comment) ...

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginViaKeycloak, verifySession } from '../lib/auth';
import { assertReachable } from '../lib/health-assertions';

const WEBSITE_URL  = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');
const ADMIN_USER   = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS   = process.env.E2E_ADMIN_PASS ?? '';
const USER         = process.env.E2E_USER ?? 'test-user';
const USER_PASS    = process.env.E2E_USER_PASS ?? '';

const AUTH_DIR           = path.join(__dirname, '..', '.auth');
const ADMIN_STATE        = path.join(AUTH_DIR, 'mentolder-website-admin.json');
const USER_STATE         = path.join(AUTH_DIR, 'mentolder-website-user.json');

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// ── Admin login ──────────────────────────────────────────────────────────────
setup('authenticate mentolder website admin', async ({ page, request }, testInfo) => {
  ensureAuthDir();

  if (!ADMIN_PASS) {
    // In prod: assertReachable on the website itself will fail if the site is
    // unreachable. The missing E2E_ADMIN_PASS is caught by downstream tests
    // via assertAuthenticatedReachable. Here we write empty state as before
    // but log more prominently.
    console.warn('[mentolder-setup] E2E_ADMIN_PASS not set — writing empty state (admin tests will use test.fixme)');
    fs.writeFileSync(ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Verify the website is reachable before attempting login
  await assertReachable(request, WEBSITE_URL, { label: 'mentolder website' }, testInfo);

  await loginViaKeycloak(page, WEBSITE_URL, ADMIN_USER, ADMIN_PASS, '/admin');

  const me = await verifySession(page.request, WEBSITE_URL);
  expect(me.authenticated, 'mentolder website session should be authenticated').toBe(true);

  await page.context().storageState({ path: ADMIN_STATE });
  console.log(`[mentolder-setup] saved mentolder-website-admin.json (user=${me.username})`);
});

// ── Portal user login ────────────────────────────────────────────────────────
setup('authenticate mentolder portal user', async ({ page }) => {
  ensureAuthDir();

  if (!USER_PASS) {
    console.log('[mentolder-setup] E2E_USER_PASS not set — skipping portal user state');
    fs.writeFileSync(USER_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  await loginViaKeycloak(page, WEBSITE_URL, USER, USER_PASS, '/portal');

  const me = await verifySession(page.request, WEBSITE_URL);
  expect(me.authenticated, 'mentolder portal session should be authenticated').toBe(true);

  await page.context().storageState({ path: USER_STATE });
  console.log(`[mentolder-setup] saved mentolder-website-user.json (user=${me.username})`);
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/mentolder-auth-setup.spec.ts
git commit -m "refactor(e2e): use assertReachable in mentolder-auth-setup (T000480)

Adds pre-flight reachability check before Keycloak login.
Empty E2E_ADMIN_PASS now logged more prominently."
```

---

### Task 5: Update arena-mentolder-auth-setup

**Files:**
- Modify: `tests/e2e/specs/arena-mentolder-auth-setup.spec.ts:16,25`

- [ ] **Step 1: Apply same pattern as mentolder-auth-setup**

```typescript
// tests/e2e/specs/arena-mentolder-auth-setup.spec.ts
//
// ... (keep existing header comment) ...

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginViaKeycloak, verifySession } from '../lib/auth';
import { assertReachable } from '../lib/health-assertions';

const ARENA_URL = (process.env.ARENA_WS_URL ?? 'wss://arena.localhost/ws').replace(/\/ws$/, '');
const ARENA_HTTP_URL = ARENA_URL.replace(/^wss/, 'https').replace(/^ws/, 'http');
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS  = process.env.E2E_ADMIN_PASS ?? '';

const AUTH_DIR    = path.join(__dirname, '..', '.auth');
const ADMIN_STATE = path.join(AUTH_DIR, 'mentolder-arena-admin.json');

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

setup('authenticate mentolder arena admin', async ({ page, request }, testInfo) => {
  ensureAuthDir();

  if (!ADMIN_PASS) {
    console.warn('[arena-mentolder-setup] E2E_ADMIN_PASS not set — writing empty state (arena tests will use test.fixme)');
    fs.writeFileSync(ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  await assertReachable(request, ARENA_HTTP_URL, { label: 'arena server' }, testInfo);
  await loginViaKeycloak(page, ARENA_HTTP_URL, ADMIN_USER, ADMIN_PASS, '/admin');

  const me = await verifySession(page.request, ARENA_HTTP_URL);
  expect(me.authenticated, 'arena session should be authenticated').toBe(true);

  await page.context().storageState({ path: ADMIN_STATE });
  console.log(`[arena-mentolder-setup] saved mentolder-arena-admin.json (user=${me.username})`);
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/arena-mentolder-auth-setup.spec.ts
git commit -m "refactor(e2e): use assertReachable in arena-mentolder-auth-setup (T000480)"
```

---

### Task 6: Update brett-mentolder-auth-setup for real prod auth

**Files:**
- Modify: `tests/e2e/specs/brett-mentolder-auth-setup.spec.ts`

- [ ] **Step 1: Rewrite for real Keycloak auth in prod**

```typescript
// tests/e2e/specs/brett-mentolder-auth-setup.spec.ts
//
// Runs in the `brett-mentolder-setup` project — authenticates against
// brett.mentolder.de (behind oauth2-proxy) via Keycloak OIDC.
//
// Env vars:
//   BRETT_URL          (default: https://brett.mentolder.de)
//   E2E_ADMIN_USER     (default: paddione)
//   E2E_ADMIN_PASS     — required for admin tests; writes empty state if absent

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginViaKeycloak, verifySession } from '../lib/auth';
import { assertReachable } from '../lib/health-assertions';

const BRETT_URL   = (process.env.BRETT_URL ?? 'https://brett.mentolder.de').replace(/\/$/, '');
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS  = process.env.E2E_ADMIN_PASS ?? '';

const AUTH_DIR    = path.join(__dirname, '..', '.auth');
const ADMIN_STATE = path.join(AUTH_DIR, 'mentolder-brett.json');

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

setup('authenticate mentolder brett admin', async ({ page, request }, testInfo) => {
  ensureAuthDir();

  if (!ADMIN_PASS) {
    console.warn('[brett-mentolder-setup] E2E_ADMIN_PASS not set — writing empty state (brett tests will use test.fixme)');
    fs.writeFileSync(ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Verify brett health endpoint is reachable before login
  await assertReachable(request, `${BRETT_URL}/healthz`, { label: 'brett healthz' }, testInfo);

  // Login via Keycloak — oauth2-proxy will intercept and redirect
  await loginViaKeycloak(page, BRETT_URL, ADMIN_USER, ADMIN_PASS, '/');

  // After login, verify we can reach the brett health endpoint authenticated
  const res = await page.request.get(`${BRETT_URL}/healthz`);
  expect(res.status(), 'brett healthz should return 200 after login').toBe(200);

  await page.context().storageState({ path: ADMIN_STATE });
  console.log(`[brett-mentolder-setup] saved mentolder-brett.json (user=${ADMIN_USER})`);
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/brett-mentolder-auth-setup.spec.ts
git commit -m "feat(e2e): real Keycloak auth for brett-mentolder-auth-setup (T000480)

Previously wrote empty state in prod. Now performs actual OIDC login
via oauth2-proxy, enabling Brett API tests to run against production."
```

---

### Task 7: Update korczewski-auth-setup

**Files:**
- Modify: `tests/e2e/specs/korczewski-auth-setup.spec.ts`

- [ ] **Step 1: Apply same pattern — add assertReachable pre-flight**

In `korczewski-auth-setup.spec.ts`, apply the same changes as Task 4:

1. Add import:
```typescript
import { assertReachable } from '../lib/health-assertions';
```

2. In the admin login setup function, add `request` and `testInfo` to the destructured parameters:
```typescript
setup('authenticate korczewski website admin', async ({ page, request }, testInfo) => {
```

3. Before the `if (!ADMIN_PASS)` block, add:
```typescript
// Verify the website is reachable before attempting login
if (ADMIN_PASS) {
  await assertReachable(request, WEBSITE_URL, { label: 'korczewski website' }, testInfo);
}
```

4. Change `console.log('E2E_ADMIN_PASS not set — writing empty state')` to:
```typescript
console.warn('[korczewski-setup] E2E_ADMIN_PASS not set — writing empty state (admin tests will use test.fixme)');
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/korczewski-auth-setup.spec.ts
git commit -m "refactor(e2e): use assertReachable in korczewski-auth-setup (T000480)"
```

---

## Phase 3: Integration-Smoke H"artung

### Task 8: Harden integration-smoke.spec.ts

**Files:**
- Modify: `tests/e2e/specs/integration-smoke.spec.ts`

- [ ] **Step 1: Rewrite integration-smoke with health-assertions**

```typescript
// tests/e2e/specs/integration-smoke.spec.ts
//
// Smoke tests for all workspace services. Uses health-assertions
// to differentiate "service not deployed" from "service is broken".

import { test, expect } from '@playwright/test';
import { assertReachable } from '../lib/health-assertions';

const DOMAIN = process.env.PROD_DOMAIN || 'localhost';

test.describe('Integration Smoke Tests', () => {

  // ── Service Reachability ──────────────────────────────────────────────

  test('@smoke Keycloak OIDC discovery is reachable', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://auth.${DOMAIN}/realms/workspace/.well-known/openid-configuration`,
      { label: 'Keycloak OIDC' },
      testInfo
    );
    const body = await res.json();
    expect(body.issuer).toContain(DOMAIN);
    expect(body.authorization_endpoint).toBeTruthy();
    expect(body.token_endpoint).toBeTruthy();
  });

  test('@smoke Nextcloud is installed and operational', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://files.${DOMAIN}/status.php`,
      { label: 'Nextcloud status' },
      testInfo
    );
    const body = await res.json();
    expect(body.installed).toBe(true);
    expect(body.maintenance).toBe(false);
    expect(body.needsDbUpgrade).toBe(false);
  });

  test('@smoke Collabora discovery endpoint responds', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://office.${DOMAIN}/hosting/discovery`,
      { acceptableStatuses: [200], allow404AsNotDeployed: true, label: 'Collabora' },
      testInfo
    );
    const text = await res.text();
    expect(text).toContain('wopi-discovery');
  });

  test('@smoke Talk signaling server responds', async ({ request }, testInfo) => {
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    if (res.status() === 503) {
      // NATS backend unavailable but ingress is alive — log as fixme
      test.fixme(true, 'Signaling NATS backend unavailable (503) — T000480');
      return;
    }
    expect(res.status()).toBe(200);
  });

  test('@smoke Vaultwarden is alive', async ({ request }, testInfo) => {
    await assertReachable(
      request,
      `https://vault.${DOMAIN}/alive`,
      { label: 'Vaultwarden /alive' },
      testInfo
    );
  });

  test('@smoke Docs site responds', async ({ request }, testInfo) => {
    // 200 = public; 302 = redirect to auth; 401 = behind auth proxy (alive)
    await assertReachable(
      request,
      `https://docs.${DOMAIN}`,
      { acceptableStatuses: [200, 302, 401], label: 'Docs' },
      testInfo
    );
  });

  test('@smoke Mailpit responds', async ({ request }, testInfo) => {
    // 200 = accessible; 302/401 = behind oauth2-proxy (alive)
    // 404/500 were accepted before but are real errors — removed (T000480)
    await assertReachable(
      request,
      `http://mail.${DOMAIN}`,
      { acceptableStatuses: [200, 302, 401], label: 'Mailpit' },
      testInfo
    );
  });

  // ── SSO Login Flow ────────────────────────────────────────────────────

  test('@smoke Keycloak login page is reachable', async ({ page }) => {
    await page.goto(`https://auth.${DOMAIN}/realms/workspace/account/`);
    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 10_000 });
  });

  test('@smoke Nextcloud shows Keycloak login button', async ({ page }) => {
    await page.goto(`https://files.${DOMAIN}/login`);
    const atKC = /realms\/workspace/.test(page.url());
    if (atKC) {
      return; // Auto-redirect to KC proves OIDC SSO is configured
    }
    const oidcButton = page.locator('a[href*="oidc"], a[href*="keycloak"], .oidc-button, .alternative-logins a[href*="social"]');
    const fallback = page.getByRole('link', { name: /keycloak|anmelden|openid|sso/i });
    await expect(oidcButton.first().or(fallback.first())).toBeVisible({ timeout: 15_000 });
  });

  // ── Collabora Integration ─────────────────────────────────────────────

  test('@smoke Collabora discovery is reachable from browser', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://office.${DOMAIN}/hosting/discovery`,
      { acceptableStatuses: [200], allow404AsNotDeployed: true, label: 'Collabora browser' },
      testInfo
    );
    const xml = await res.text();
    expect(xml).toContain('application/vnd.openxmlformats-officedocument');
  });

  // ── Talk Integration ──────────────────────────────────────────────────

  test('@smoke Talk signaling endpoint is configured', async ({ request }, testInfo) => {
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    if (res.status() === 503) {
      test.fixme(true, 'Signaling NATS backend unavailable (503) — T000480');
      return;
    }
    expect(res.status()).toBe(200);
  });

  // ── New k3d Services ──────────────────────────────────────────────────

  test('@smoke Brett systemisches Brett healthz is reachable', async ({ request }, testInfo) => {
    await assertReachable(
      request,
      `https://brett.${DOMAIN}/healthz`,
      { label: 'Brett /healthz' },
      testInfo
    );
  });

  test('@smoke DocuSeal document signing is reachable', async ({ request }, testInfo) => {
    // 200 = public UI; 302 = redirect (oauth/SSO); 401 = auth-protected
    // 301 was previously accepted but is a config error (T000480)
    const res = await assertReachable(
      request,
      `https://sign.${DOMAIN}`,
      { acceptableStatuses: [200, 302, 401], label: 'DocuSeal' },
      testInfo
    );
    // Additional check: if 302, verify it's not redirecting to /setup
    if (res.status() === 302) {
      const location = res.headers()['location'] || '';
      if (location.includes('/setup')) {
        test.fixme(true, `DocuSeal ${DOMAIN}: unprovisioned — redirects to /setup (T000477)`);
      }
    }
  });

  test('@smoke Requirements Tracking UI is reachable', async ({ request }, testInfo) => {
    await assertReachable(
      request,
      `https://tracking.${DOMAIN}`,
      { acceptableStatuses: [200, 301, 302, 401], allow404AsNotDeployed: true, label: 'Tracking' },
      testInfo
    );
  });

  test('@smoke LiveKit server ingress is reachable', async ({ request }, testInfo) => {
    // LiveKit returns 404/426 on HTTP root — both confirm the ingress is alive
    await assertReachable(
      request,
      `https://livekit.${DOMAIN}/`,
      { acceptableStatuses: [200, 404, 426], timeout: 10_000, label: 'LiveKit' },
      testInfo
    );
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/integration-smoke.spec.ts
git commit -m "refactor(e2e): harden integration-smoke with health-assertions (T000480)

- Collabora/Tracking: use allow404AsNotDeployed instead of test.skip
- DocuSeal: detect /setup redirect (unprovisioned)
- Mailpit: removed 404/500 from acceptable statuses
- Signaling: 503 → test.fixme (NATS backend)
- All reachability checks use assertReachable"
```

---

## Phase 4: Brett PROD_DOMAIN Skip-Entfernung (K2)

### Task 9: Remove PROD_DOMAIN skips from fa-27-brett

**Files:**
- Modify: `tests/e2e/specs/fa-27-brett.spec.ts:18,32,43,51,59,65,75,83,91,108`

- [ ] **Step 1: Remove all 11 test.skip(!!PROD_DOMAIN, ...) lines**

In `fa-27-brett.spec.ts`, remove every line matching:
```typescript
test.skip(!!process.env.PROD_DOMAIN, 'Brett API requires auth in prod (oauth2-proxy)');
```

No replacement needed — the tests now use `storageState` from `brett-mentolder-auth-setup` (Task 6), which performs real OIDC login in prod. The `test.skip` guard is no longer necessary.

- [ ] **Step 2: Verify storageState is configured in playwright.config.ts**

Check that `playwright.config.ts` has the brett project using the auth state file from Task 6. If not, add:

```typescript
// In the brett-mentolder project config:
{
  name: 'brett-mentolder',
  use: {
    ...devices['Desktop Chrome'],
    storageState: '.auth/mentolder-brett.json',
  },
  dependencies: ['brett-mentolder-setup'],
}
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-27-brett.spec.ts tests/e2e/playwright.config.ts
git commit -m "feat(e2e): remove PROD_DOMAIN skips from Brett tests (T000480)

Brett API tests now use real OIDC auth in prod via brett-mentolder-auth-setup.
All 11 test.skip(!!PROD_DOMAIN, ...) guards removed."
```

---

## Phase 5: K1 Migration — E2E_ADMIN_PASS Skips (Batch 1: High-Impact)

### Task 10: Migrate top admin specs from test.skip to assertAuthenticatedReachable

**Files (Batch 1 — 12 files):**
- `tests/e2e/specs/fa-admin-db-crud-clients.spec.ts`
- `tests/e2e/specs/fa-admin-db-crud-followups.spec.ts`
- `tests/e2e/specs/fa-admin-db-crud-projekte.spec.ts`
- `tests/e2e/specs/fa-admin-db-crud-shortcuts.spec.ts`
- `tests/e2e/specs/fa-admin-inbox.spec.ts`
- `tests/e2e/specs/fa-admin-inbox-delete.spec.ts`
- `tests/e2e/specs/fa-admin-tickets.spec.ts`
- `tests/e2e/specs/fa-43-ticket-widget.spec.ts`
- `tests/e2e/specs/fa-45-authenticated-flows.spec.ts`
- `tests/e2e/specs/fa-44-platform-health-integrity.spec.ts`
- `tests/e2e/specs/fa-bugs-notifications.spec.ts`
- `tests/e2e/specs/fa-bug-t000368.spec.ts`

- [ ] **Step 1: For each file, apply the migration pattern**

Replace:
```typescript
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

// In beforeEach or individual test:
test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping');
```

With:
```typescript
import { assertAuthenticatedReachable } from '../lib/health-assertions';

// In beforeEach or individual test, replace the skip with a reachability check
// on the specific admin endpoint the test targets:

// Example for fa-admin-inbox.spec.ts:
test('admin inbox loads', async ({ page, request }, testInfo) => {
  await assertAuthenticatedReachable(
    request,
    `${WEBSITE_URL}/api/admin/inbox`,
    { label: 'admin inbox API' },
    testInfo
  );
  // ... rest of test unchanged
});
```

**Key rule:** Each test gets a pre-flight `assertAuthenticatedReachable` call on the specific endpoint it tests. The function handles both the missing-credentials case and the unreachable case.

- [ ] **Step 2: Per-file migration details — fa-admin-inbox.spec.ts example**

Current pattern (line ~54):
```typescript
testInfo.skip(true, 'E2E_ADMIN_PASS not set — skipping admin inbox rework specs');
```

New pattern:
```typescript
// Add import at top:
import { assertAuthenticatedReachable } from '../lib/health-assertions';

// In the test (after beforeEach login):
await assertAuthenticatedReachable(
  request,
  `${WEBSITE_URL}/admin/inbox`,
  { acceptableStatuses: [200, 302], label: 'admin inbox page' },
  testInfo
);
```

- [ ] **Step 3: Commit (one commit per file or batch)**

```bash
git add tests/e2e/specs/fa-admin-*.spec.ts tests/e2e/specs/fa-43-ticket-widget.spec.ts tests/e2e/specs/fa-45-authenticated-flows.spec.ts tests/e2e/specs/fa-44-platform-health-integrity.spec.ts tests/e2e/specs/fa-bugs-notifications.spec.ts tests/e2e/specs/fa-bug-t000368.spec.ts
git commit -m "refactor(e2e): migrate admin specs batch1 to assertAuthenticatedReachable (T000480)

Replaced test.skip(!E2E_ADMIN_PASS) with pre-flight assertAuthenticatedReachable.
12 files: admin-inbox, admin-tickets, admin-db-crud-*, ticket-widget,
authenticated-flows, platform-health, bugs-notifications, bug-t000368"
```

---

### Task 11: Migrate remaining admin/authenticated specs (Batch 2)

**Files (Batch 2 — ~18 files):**
- `tests/e2e/specs/fa-fragebogen.spec.ts`
- `tests/e2e/specs/wissensquellen.spec.ts`
- `tests/e2e/specs/fa-30-systemtest-failure-loop.spec.ts`
- `tests/e2e/specs/fa-39-coaching-sessions.spec.ts`
- `tests/e2e/specs/fa-39-lmstudio-integration.spec.ts`
- `tests/e2e/specs/fa-46-lernpfad-cta.spec.ts`
- `tests/e2e/specs/fa-admin-knowledge-model-selection.spec.ts`
- `tests/e2e/specs/fa-admin-inhalte.spec.ts`
- `tests/e2e/specs/fa-admin-live.spec.ts`
- `tests/e2e/specs/fa-admin-settings.spec.ts`
- `tests/e2e/specs/fa-admin-monitoring.spec.ts`
- `tests/e2e/specs/fa-admin-newsletter.spec.ts`
- `tests/e2e/specs/fa-admin-backup-settings.spec.ts`
- `tests/e2e/specs/fa-admin-billing-system.spec.ts`
- `tests/e2e/specs/fa-admin-crm.spec.ts`
- `tests/e2e/specs/fa-client-portal.spec.ts`
- `tests/e2e/specs/fa-coaching-drafts.spec.ts`
- `tests/e2e/specs/fa-coaching-knowledge.spec.ts`
- `tests/e2e/specs/fa-coaching-publish.spec.ts`
- `tests/e2e/specs/fa-document-signing.spec.ts`
- `tests/e2e/specs/fa-content-hub-price-ssot.spec.ts`
- `tests/e2e/helpers/billing.ts`

- [ ] **Step 1: Apply same migration pattern as Task 10**

For each file:
1. Add `import { assertAuthenticatedReachable } from '../lib/health-assertions'`
2. Replace `test.skip(!ADMIN_PASS, ...)` / `testInfo.skip(true, ...)` with pre-flight `assertAuthenticatedReachable` on the endpoint the test targets
3. Remove the `const ADMIN_PASS = process.env.E2E_ADMIN_PASS` if no longer used

**Special case — fa-content-hub-price-ssot.spec.ts:**
Replace:
```typescript
const HAS_CREDS = !!process.env.E2E_ADMIN_PASS;
test.skip(!HAS_CREDS, 'requires E2E_ADMIN_PASS (authenticated write)');
```
With:
```typescript
import { assertAuthenticatedReachable } from '../lib/health-assertions';
// In test:
await assertAuthenticatedReachable(request, `${WEBSITE_URL}/api/admin/content-hub/prices`, { label: 'content-hub prices API' }, testInfo);
```

**Special case — helpers/billing.ts:**
Replace:
```typescript
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.E2E_ADMIN_PASS || '';
```
With import-based approach and pass `request` + `testInfo` from the calling test context.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/fa-*.spec.ts tests/e2e/specs/wissensquellen.spec.ts tests/e2e/helpers/billing.ts
git commit -m "refactor(e2e): migrate admin specs batch2 to assertAuthenticatedReachable (T000480)

Replaced remaining test.skip(!E2E_ADMIN_PASS) patterns across 18+ files.
Includes fragebogen, wissensquellen, systemtest-failure-loop,
coaching-*, admin-*, client-portal, document-signing, content-hub-price."
```

---

## Phase 6: K3–K7 Fixes

### Task 12: Hard-skips → test.fixme (K3)

**Files:**
- `tests/e2e/specs/ak-03-technical.spec.ts:53`
- `tests/e2e/specs/nfa-04-scalability.spec.ts:36`
- `tests/e2e/specs/nfa-07-opensource.spec.ts:32`
- `tests/e2e/specs/nfa-08-production-deploy.spec.ts:44`
- `tests/e2e/specs/nfa-09-static-dns.spec.ts:31`

- [ ] **Step 1: Replace test.skip(true) with test.fixme(true)**

For each file, replace:
```typescript
test.skip(true, 'T1-T2: kubectl-Operationen erfordern Cluster-Zugriff');
```
With:
```typescript
test.fixme(true, 'T1-T2: kubectl-Operationen erfordern Cluster-Zugriff — T000480');
```

Note: `test.fixme()` is a Playwright built-in. It marks the test as "fixme" in the report (skipped but visible), unlike `test.skip(true)` which counts as "passed."

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/ak-03-technical.spec.ts tests/e2e/specs/nfa-04-scalability.spec.ts tests/e2e/specs/nfa-07-opensource.spec.ts tests/e2e/specs/nfa-08-production-deploy.spec.ts tests/e2e/specs/nfa-09-static-dns.spec.ts
git commit -m "refactor(e2e): test.skip(true) → test.fixme(true) hard-skips (T000480)

test.fixme is visible in the Playwright report as 'fixme', not silently 'passed'.
Appended T000480 marker for traceability."
```

---

### Task 13: Transcriber test.skip → test.fixme (K4)

**Files:**
- Modify: `tests/e2e/specs/fa-18-transcription.spec.ts`

- [ ] **Step 1: Replace serviceAvailable skip pattern**

Find the `beforeAll` or `beforeEach` block that sets `serviceAvailable`:

```typescript
let serviceAvailable = false;
test.beforeAll(async () => {
  try {
    // ... attempt connection to TRANSCRIBER_URL ...
    serviceAvailable = true;
  } catch {
    serviceAvailable = false;
  }
});
```

Replace all:
```typescript
test.skip(!serviceAvailable, 'Transcriber not reachable');
```
With:
```typescript
test.fixme(!serviceAvailable, 'Transcriber ClusterIP-only — requires in-cluster runner (T000480)');
```

Note: `test.fixme(condition, reason)` — if condition is true, the test is marked fixme. This is the same control flow as `test.skip(condition, reason)` but with visible output.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/fa-18-transcription.spec.ts
git commit -m "refactor(e2e): transcriber test.skip → test.fixme (T000480)

Transcriber is ClusterIP-only and cannot be reached from external runners.
test.fixme makes this visible instead of silently passing."
```

---

### Task 14: Fix signaling 503 handling (K6)

**Files:**
- Modify: `tests/e2e/specs/fa-03-video.spec.ts`

- [ ] **Step 1: Find and replace 503-tolerant assertions**

Search for patterns like `expect([200, 503]).toContain(...)` or `if (503) test.skip(true, ...)` in `fa-03-video.spec.ts`. Replace with:

```typescript
// BEFORE:
expect([200, 503]).toContain(res.status());

// AFTER:
if (res.status() === 503) {
  test.fixme(true, 'Signaling NATS backend unavailable (503) — T000480');
  return;
}
expect(res.status()).toBe(200);
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/specs/fa-03-video.spec.ts
git commit -m "refactor(e2e): signaling 503 → test.fixme in video spec (T000480)"
```

---

### Task 15: Fix transport-error handling in LiveKit + Content-Hub (K7)

**Files:**
- `tests/e2e/specs/fa-livekit.spec.ts`
- `tests/e2e/specs/fa-content-hub-concurrency.spec.ts`

- [ ] **Step 1: fa-livekit.spec.ts — replace .catch(() => null) → skip pattern**

Search for patterns like:
```typescript
someRequest.catch(() => null);
// ... later:
test.skip(!result, 'LiveKit not reachable');
```

Replace with:
```typescript
import { assertReachable } from '../lib/health-assertions';

// In test:
await assertReachable(
  request,
  `https://livekit.${DOMAIN}/`,
  { acceptableStatuses: [200, 404, 426], timeout: 10_000, label: 'LiveKit' },
  testInfo
);
```

- [ ] **Step 2: fa-content-hub-concurrency.spec.ts — same pattern**

Replace any `.catch(() => null) → skip` with `assertReachable`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-livekit.spec.ts tests/e2e/specs/fa-content-hub-concurrency.spec.ts
git commit -m "refactor(e2e): transport-errors → assertReachable in LiveKit+ContentHub (T000480)"
```

---

## Phase 7: Verification & Cleanup

### Task 16: Run full E2E suite and verify no silent skips

- [ ] **Step 1: Run without PROD_DOMAIN (dev mode) to verify fixme behavior**

```bash
cd tests/e2e && npx playwright test --project=mentolder 2>&1 | tee /tmp/e2e-t000480-dev.log
```
Expected: Admin specs should show as "fixme" (E2E_ADMIN_PASS not set), not "passed".
Integration-smoke should pass for reachable services.

- [ ] **Step 2: Run with PROD_DOMAIN set to verify hard-failure behavior (simulated prod)**

```bash
cd tests/e2e && PROD_DOMAIN=mentolder.de npx playwright test integration-smoke.spec.ts 2>&1 | tee /tmp/e2e-t000480-prod.log
```
Expected: Integration-smoke should fail hard on unreachable services (no silent skips).

- [ ] **Step 3: Verify no remaining test.skip(true, ...) or unguarded skip patterns**

```bash
grep -rn 'test\.skip(true' tests/e2e/specs/ tests/e2e/helpers/ tests/e2e/lib/ | grep -v node_modules | grep -v '.test.ts'
```
Expected: No remaining `test.skip(true, ...)` calls (all migrated to `test.fixme(true, ...)`).

```bash
grep -rn 'test\.skip(!process.env.E2E_ADMIN_PASS' tests/e2e/specs/
```
Expected: No remaining `test.skip(!process.env.E2E_ADMIN_PASS` calls.

- [ ] **Step 4: Run test inventory check**

```bash
task test:inventory
```
Expected: No changes (or regenerate and commit if new tests added).

- [ ] **Step 5: Commit any remaining changes**

```bash
git add tests/e2e/
git commit -m "chore(e2e): final verification — no silent skips remain (T000480)

All test.skip patterns migrated to assertReachable/assertAuthenticatedReachable
or test.fixme. Verification grep confirms zero remaining test.skip(true),
test.skip(!E2E_ADMIN_PASS), or soft-expect patterns."
```

---

### Task 17: Create GitHub secret (manual — before merge)

- [ ] **Step 1: Verify E2E_ADMIN_PASS exists in repo secrets**

Check: https://github.com/Paddione/Bachelorprojekt/settings/secrets/actions
Look for `E2E_ADMIN_PASS`. If missing:
- Name: `E2E_ADMIN_PASS`
- Value: Keycloak password for `paddione` user

- [ ] **Step 2: Document in relevant runbook**

Update `docs/superpowers/specs/2026-06-07-e2e-green-on-skip-fix-design.md` with the actual secret name and creation date once done.

---

## Execution Order & Dependencies

```
Task 1 (health-assertions.ts)
  └─> Task 2 (tests)
       └─> Task 3 (e2e.yml)
       └─> Task 4 (mentolder-auth-setup)
            └─> Task 5 (arena-auth-setup)
            └─> Task 6 (brett-auth-setup)
            └─> Task 7 (korczewski-auth-setup)
       └─> Task 8 (integration-smoke)
       └─> Task 9 (fa-27-brett)
       └─> Task 10 (K1 batch 1)
            └─> Task 11 (K1 batch 2)
       └─> Task 12 (K3 hard-skips)
       └─> Task 13 (K4 transcriber)
       └─> Task 14 (K6 signaling)
       └─> Task 15 (K7 livekit+contenthub)
       └─> Task 16 (verification)
       └─> Task 17 (GitHub secret — manual)
```

Tasks 3–15 can run in parallel after Task 2 completes, since they all depend only on `health-assertions.ts`.

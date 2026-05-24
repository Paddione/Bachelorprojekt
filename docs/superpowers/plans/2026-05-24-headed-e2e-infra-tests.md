---
title: Headed E2E Infrastructure Tests
branch: feature/headed-e2e-infra-tests
spec: docs/superpowers/specs/2026-05-24-headed-e2e-infra-tests-design.md
status: staged
ticket_id: T000207
domains: test
---

# Plan: Headed E2E Infrastructure Tests

**Goal:** Replace shallow 401/403 auth-gating tests with real infrastructure probes — authenticated flows, service health sweeps, and cross-cluster verification.

**Test files to create:** 5 new files  
**Test files to modify:** 1 (playwright.config.ts)  
**Lib files to create:** 1 (auth.ts helper)

---

## Step 1 — Create `tests/e2e/lib/auth.ts`

Centralized auth helpers. Extract the OIDC login pattern from `korczewski-auth-setup.spec.ts` into reusable functions:

```typescript
// Performs real Keycloak OIDC login and returns when back on the website.
export async function loginViaKeycloak(page, baseUrl, user, pass, returnTo = '/admin')

// Verifies the current session is active via /api/auth/me.
export async function verifySession(request, baseUrl): Promise<{ authenticated: boolean; username?: string }>
```

Pattern: goto `${baseUrl}/api/auth/login?returnTo=${returnTo}`, waitForURL `/realms/workspace/`, fill `#username`, fill `#password`, click `#kc-login`, waitForURL back to baseUrl.

---

## Step 2 — Create `tests/e2e/specs/mentolder-auth-setup.spec.ts`

New setup spec (mirrors `korczewski-auth-setup.spec.ts`):

```
WEBSITE_URL (default: https://web.mentolder.de)
E2E_ADMIN_USER (default: paddione)
E2E_ADMIN_PASS — required; writes empty state if missing

Writes:
  .auth/mentolder-website-admin.json  — workspace_session cookie for web.mentolder.de
  .auth/mentolder-website-user.json   — workspace_session cookie for portal user (if E2E_USER_PASS set)
```

Two setup tests:
1. `authenticate mentolder website admin` — full OIDC flow, verifies /api/auth/me → `{ authenticated: true }`
2. `authenticate mentolder portal user` — same but for E2E_USER / E2E_USER_PASS (skips if not set)

---

## Step 3 — Create `tests/e2e/specs/nfa-infra-health-sweep.spec.ts`

Systematically probes all 17 workspace services. Each test uses `request` fixture (no auth needed — service-level reachability).

Structure:
```typescript
test.describe('NFA-INFRA: Service Health Sweep', () => {
  const DOMAIN = process.env.PROD_DOMAIN ?? 'localhost';
  // helper: buildUrl(subdomain, path) → uses PROD_DOMAIN or localhost fallback
  
  // Group 1: Core auth + website
  test('website: root returns 200', ...)
  test('website: /api/health returns { ok: true }', ...)  
  test('keycloak: OIDC discovery returns 200 JSON', ...)  // /realms/workspace/.well-known/openid-configuration
  
  // Group 2: Collaboration suite
  test('nextcloud: /status.php returns 200 with installed:true', ...)
  test('collabora: /hosting/discovery returns 200 XML', ...)
  test('whiteboard: root reachable', ...)
  test('vaultwarden: /alive returns 200', ...)
  test('docuseal: root reachable', ...)
  
  // Group 3: Communication
  test('mailpit: /api/v1/messages returns 200 or 401', ...)
  test('docs: root returns 200', ...)
  
  // Group 4: Media + gaming
  test('brett: root reachable (oauth2-proxy redirect)', ...)
  test('livekit: LSWS endpoint reachable', ...)
  test('arena: /health returns 200', ...)
  
  // Group 5: Website API health endpoints
  test('website: /api/auth/login redirects to keycloak', ...)
  test('website: /api/auth/me returns 200 with authenticated field', ...)
})
```

All tests: `maxRedirects: 3`, `ignoreHTTPSErrors: true`, skip localhost-only services when `PROD_DOMAIN` not set.

---

## Step 4 — Create `tests/e2e/specs/fa-45-authenticated-flows.spec.ts`

Uses `storageState` from Step 2. Tests the positive paths that shallow tests only check negatively.

```typescript
// Project: mentolder (storageState: '.auth/mentolder-website-admin.json')
test.describe('FA-45: Authenticated API flows', () => {
  test.skip(!process.env.E2E_ADMIN_PASS, 'requires credentials')
  
  test('T1: /api/auth/me returns authenticated user', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.authenticated).toBe(true)
    expect(body).toHaveProperty('username')
  })
  
  test('T2: /api/portal/rooms returns JSON array', async ({ request }) => { ... })
  test('T3: /api/admin/ops/health returns cluster results', async ({ request }) => { ... })
  test('T4: /api/admin/platform/software returns assets', async ({ request }) => { ... })
  test('T5: /portal page loads without redirect', async ({ page }) => { ... })
  test('T6: /admin page loads without redirect', async ({ page }) => { ... })
  test('T7: /api/admin/inbox/count returns numeric value', async ({ request }) => { ... })
  test('T8: /api/admin/bugs returns bug list', async ({ request }) => { ... })
})
```

---

## Step 5 — Create `tests/e2e/specs/sa-15-cross-cluster-health.spec.ts`

```typescript
test.describe('SA-15: Cross-Cluster Health', () => {
  // mentolder services
  test('mentolder: website root 200', ...)  // WEBSITE_URL or https://web.mentolder.de
  test('mentolder: keycloak OIDC discovery 200', ...)
  test('mentolder: nextcloud status 200', ...)
  test('mentolder: TLS cert valid (no cert error)', ...)
  
  // korczewski services  
  test('korczewski: website root 200', ...)  // KORCZEWSKI_URL or https://web.korczewski.de
  test('korczewski: keycloak OIDC discovery 200', ...)
  test('korczewski: brett root reachable', ...)
  test('korczewski: TLS cert valid', ...)
  
  // korczewski-only services
  test('arena: /health returns 200 (korczewski-only)', ...)  // arena-ws.korczewski.de/health
  
  // cluster independence verification  
  test('clusters: auth domains differ (no cross-auth)', async ({ request }) => {
    // Verify auth.mentolder.de /realms/workspace has clientId=website (mentolder realm)
    // Verify auth.korczewski.de /realms/workspace has clientId=website (korczewski realm)  
    // They should be independent realms
  })
})
```

---

## Step 6 — Update `tests/e2e/playwright.config.ts`

Add two new projects:

```typescript
// ── mentolder-setup: seeds mentolder website auth state ──────────────
{
  name: 'mentolder-setup',
  testMatch: '**/mentolder-auth-setup.spec.ts',
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
  },
},

// ── mentolder: Authenticated mentolder tests ─────────────────────────
{
  name: 'mentolder',
  dependencies: ['mentolder-setup'],
  testMatch: [
    '**/fa-45-*.spec.ts',
    '**/nfa-infra-health-sweep.spec.ts',
    '**/sa-15-*.spec.ts',
  ],
  use: {
    ...devices['Desktop Chrome'],
    ignoreHTTPSErrors: true,
    storageState: '.auth/mentolder-website-admin.json',
  },
},
```

Also add `**/nfa-infra-health-sweep.spec.ts` to the `services` project testMatch.

---

## Step 7 — Verification

```bash
cd tests/e2e

# TypeScript type-check only (no cluster needed)
npx tsc --noEmit

# Run health sweep against prod (requires PROD_DOMAIN)
PROD_DOMAIN=mentolder.de \
  npx playwright test nfa-infra-health-sweep.spec.ts --project=services --headed

# Run cross-cluster spec
npx playwright test sa-15-cross-cluster-health.spec.ts --project=services --headed

# Run auth setup + authenticated flows (requires E2E_ADMIN_PASS)
E2E_ADMIN_PASS=<pass> WEBSITE_URL=https://web.mentolder.de \
  npx playwright test mentolder-auth-setup.spec.ts --project=mentolder-setup --headed
E2E_ADMIN_PASS=<pass> WEBSITE_URL=https://web.mentolder.de \
  npx playwright test fa-45-authenticated-flows.spec.ts --project=mentolder --headed

# Ensure test inventory stays in sync
task test:inventory && git diff --exit-code website/src/data/test-inventory.json || true
```

---

## Implementation Order

1. `lib/auth.ts` — no deps, pure utility
2. `mentolder-auth-setup.spec.ts` — depends on lib/auth.ts
3. `nfa-infra-health-sweep.spec.ts` — no auth deps, pure HTTP probes
4. `sa-15-cross-cluster-health.spec.ts` — no auth deps
5. `fa-45-authenticated-flows.spec.ts` — depends on mentolder-setup
6. `playwright.config.ts` — wire up new projects
7. TypeScript check + headed smoke test

---

## Risks

- **`storageState` path**: `.auth/mentolder-website-admin.json` must exist before `mentolder` project runs. The `dependencies` field handles this in CI, but local runs need `mentolder-setup` first.
- **Service URL fallbacks**: Localhost services (Collabora, HPB signaling, Whiteboard) may not be reachable in CI unless `PROD_DOMAIN` is set — use `test.skip` guards.
- **Nextcloud status.php**: Returns JSON `{ installed: true, version: ..., ... }` — parse carefully; it always returns 200 even if maintenance mode is on.

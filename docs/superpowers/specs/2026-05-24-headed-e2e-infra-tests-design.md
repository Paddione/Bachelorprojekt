# Spec: Headed E2E Infrastructure Tests

**Date:** 2026-05-24  
**Branch:** feature/headed-e2e-infra-tests  
**Goal:** Make Playwright E2E tests actually verify the full infrastructure, not just check that unauthenticated requests return 401/403.

## Problem Statement

123 spec files exist, but ~70% are shallow: they only check that endpoints return 401/403 when unauthenticated. Almost no tests:
- Do a real OIDC login via Keycloak and verify the session works
- Hit authenticated endpoints and verify response bodies
- Probe all services systematically (Nextcloud, Vaultwarden, Docs, DocuSeal, etc.)
- Verify cross-cluster health (both mentolder + korczewski)

The `systemtest-runner.ts` and `korczewski-auth-setup.spec.ts` are the gold-standard patterns — we need more tests that follow this approach.

## What We Build

### 1. Centralized auth helper — `tests/e2e/lib/auth.ts`
Deduplicates the OIDC login logic that is currently copy-pasted across 4 setup specs.  
Exports: `loginAsAdmin(page, baseUrl, user, pass)`, `loginAsUser(page, baseUrl, user, pass)`, `verifySessionActive(request, baseUrl)`.

### 2. `mentolder-auth-setup.spec.ts`
Mirrors `korczewski-auth-setup.spec.ts` for the mentolder cluster.  
Writes: `.auth/mentolder-website-admin.json`, `.auth/mentolder-website-user.json`.  
Env vars: `WEBSITE_URL` (https://web.mentolder.de), `E2E_ADMIN_USER`, `E2E_ADMIN_PASS`, `E2E_USER`, `E2E_USER_PASS`.

### 3. `nfa-infra-health-sweep.spec.ts`
Systematic HTTP probe of all 17 services in the workspace. For each service:
- Expected status codes (200/302/401 with reason)
- Health-specific endpoint where available

Services covered:
| Service | URL pattern | Probe endpoint | Expected |
|---------|-------------|----------------|----------|
| Website | web.{domain} | / | 200 |
| Keycloak | auth.{domain} | /realms/workspace/.well-known/openid-configuration | 200 |
| Nextcloud | files.{domain} | /status.php | 200 JSON |
| Collabora | office.{domain} | /hosting/discovery | 200 XML |
| Vaultwarden | vault.{domain} | /alive | 200 |
| Whiteboard | board.{domain} | / | 200/302 |
| Brett | brett.{domain} | / | 200/302 (oauth2-proxy) |
| Mailpit | mail.{domain} | /api/v1/messages | 200/401 |
| Docs | docs.{domain} | / | 200 |
| DocuSeal | sign.{domain} | / | 200/302 |
| Tracking | tracking.{domain} | / | 200/302 |
| LiveKit | livekit.{domain} | / | 200/302 |
| Arena WS | arena-ws.{domain} | /health | 200 |
| MCP | mcp.{domain} | / | 200/302/401 |
| HPB signaling | signaling.{domain} | / | 200/302 |
| LLM Router | (internal, skip if not set) | /health | 200 |
| API health | web.{domain} | /api/health | 200 `{ ok: true }` |

Runs for both mentolder and korczewski via `PROD_DOMAIN` env var.

### 4. `fa-45-authenticated-flows.spec.ts`
Positive-path authenticated tests using stored session state from `mentolder-auth-setup`.  
Tests (using `storageState: '.auth/mentolder-website-admin.json'`):
- T1: `/api/auth/me` returns `{ authenticated: true, username: ... }`
- T2: `/api/admin/ops/health` returns cluster health with services array
- T3: `/api/admin/platform/software` returns assets list with collabora entry
- T4: `/portal` page loads without redirect
- T5: `/admin` page loads without redirect
- T6: `/api/portal/rooms` returns JSON array (not 401)
- T7: `/api/admin/inbox/count` returns numeric count

### 5. `sa-15-cross-cluster-health.spec.ts`
Verifies both clusters are independently healthy:
- mentolder: web.mentolder.de root, auth.mentolder.de OIDC discovery, files.mentolder.de status.php
- korczewski: web.korczewski.de root, auth.korczewski.de OIDC discovery, brett.korczewski.de root
- Arena: arena-ws.korczewski.de /health (korczewski-only service)
- TLS: both clusters serve valid HTTPS (no cert errors)

### 6. `playwright.config.ts` additions
New project: `mentolder`  
- depends on `mentolder-setup`  
- testMatch: `**/fa-45-*.spec.ts`, `**/nfa-infra-health-sweep.spec.ts`, `**/sa-15-*.spec.ts`
- storageState: `.auth/mentolder-website-admin.json`

New project: `mentolder-setup`  
- testMatch: `**/mentolder-auth-setup.spec.ts`

Update `services` project to include `**/nfa-infra-health-sweep.spec.ts`.

## Patterns to Follow

- Auth: follow `korczewski-auth-setup.spec.ts` exactly — goto /api/auth/login?returnTo=, waitForURL /realms/workspace, fill #username/#password, click #kc-login, waitForURL back to website, verify /api/auth/me
- Health check: follow `nfa-03-availability.spec.ts` — use `process.env.PROD_DOMAIN` fallbacks
- Skip pattern: `test.skip(!process.env.E2E_ADMIN_PASS, 'skip without credentials')`
- Service URLs: always use `process.env.PROD_DOMAIN ?? 'localhost'` for prod-agnostic tests

## Environment Variables Needed

```bash
# Mentolder (already used by existing tests)
WEBSITE_URL=https://web.mentolder.de
E2E_ADMIN_USER=paddione
E2E_ADMIN_PASS=<password>
PROD_DOMAIN=mentolder.de

# Cross-cluster
KORCZEWSKI_URL=https://web.korczewski.de
KORCZEWSKI_DOMAIN=korczewski.de
```

## Out of Scope

- Nextcloud WebDAV file operations (requires Nextcloud-specific credentials separate from SSO)
- LiveKit room creation (requires LiveKit SDK)
- Real message send/receive (requires two-session setup)
- Whisper transcription (requires audio file upload)

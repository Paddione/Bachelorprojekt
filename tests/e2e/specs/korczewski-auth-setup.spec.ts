// tests/e2e/specs/korczewski-auth-setup.spec.ts
//
// Runs in the `korczewski-setup` project — a dependency of the `korczewski`
// project. Performs real Keycloak OIDC logins and writes storageState files:
//
//   .auth/korczewski-website-admin.json  — workspace_session cookie for web.korczewski.de
//   .auth/korczewski-brett.json          — _oauth2_proxy_brett cookie for brett.korczewski.de
//
// Env vars (export manually or load from the K8s Secret):
//   TEST_ADMIN_USER      (default: test-admin)
//   TEST_ADMIN_PASSWORD  — required for authenticated tests; skips if absent
//   TEST_USER            (default: test-user) — reserved for portal tests
//
// Extract from the in-cluster Secret:
//   kubectl get secret playwright-test-credentials \
//     -n workspace-korczewski --context fleet \
//     -o go-template='{{range $k,$v := .data}}{{$k}}={{$v|base64decode}}{{"\n"}}{{end}}'

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginViaE2E } from '../lib/auth';
import { assertReachable } from '../lib/health-assertions';

const WEBSITE_URL = (process.env.KORCZEWSKI_URL ?? 'https://web.korczewski.de').replace(/\/$/, '');
const BRETT_URL   = (process.env.BRETT_URL ?? 'https://brett.korczewski.de').replace(/\/$/, '');

const ADMIN_USER  = process.env.TEST_ADMIN_USER     ?? 'test-admin';
const ADMIN_PASS  = process.env.TEST_ADMIN_PASSWORD ?? '';

const AUTH_DIR               = path.join(__dirname, '..', '.auth');
const WEBSITE_ADMIN_STATE    = path.join(AUTH_DIR, 'korczewski-website-admin.json');
const BRETT_ADMIN_STATE      = path.join(AUTH_DIR, 'korczewski-brett.json');

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// ── Website admin login ───────────────────────────────────────────────────────
setup('authenticate korczewski website admin', async ({ page, request }, testInfo) => {
  ensureAuthDir();

  // Verify the website is reachable before attempting login
  if (ADMIN_PASS) {
    await assertReachable(request, WEBSITE_URL, { label: 'korczewski website' }, testInfo);
  }

  if (!ADMIN_PASS) {
    console.warn('[korczewski-setup] E2E_ADMIN_PASS not set — writing empty state (admin tests will use test.fixme)');
    fs.writeFileSync(WEBSITE_ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // E2E login via /api/auth/e2e-login (bypasses Pocket ID passkey flow)
  await loginViaE2E(page, WEBSITE_URL, ADMIN_USER, '/admin');
  await page.waitForLoadState('load', { timeout: 60_000 });

  // Verify we have a session (the /api/auth/me endpoint returns { authenticated: true })
  const meRes = await page.request.get(`${WEBSITE_URL}/api/auth/me`);
  const me = await meRes.json();
  expect(me.authenticated, 'website session should be authenticated').toBe(true);

  await page.context().storageState({ path: WEBSITE_ADMIN_STATE });
  console.log('[korczewski-setup] saved korczewski-website-admin.json');
});

// ── Brett admin login (oauth2-proxy) ─────────────────────────────────────────
setup('authenticate korczewski brett', async ({ page, request }, testInfo) => {
  ensureAuthDir();

  // Verify brett is reachable before attempting login
  if (ADMIN_PASS) {
    await assertReachable(request, BRETT_URL, { label: 'korczewski brett' }, testInfo);
  }

  if (!ADMIN_PASS) {
    console.warn('[korczewski-setup] E2E_ADMIN_PASS not set — writing empty state (admin tests will use test.fixme)');
    fs.writeFileSync(BRETT_ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Pocket ID has no password form — oauth2-proxy services need one-time access code flow (T003163)
  testInfo.fixme(true, 'brett oauth2-proxy → Pocket ID needs passkey/one-time-code auth');
  fs.writeFileSync(BRETT_ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
  console.log('[korczewski-setup] skipped brett login — Pocket ID migration pending');
});

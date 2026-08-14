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
//   CRON_SECRET          — REQUIRED. loginViaE2E authenticates via
//                          /api/auth/e2e-login?token=$CRON_SECRET; without it the
//                          website admin setup fails hard so Playwright skips the
//                          dependent `korczewski` project instead of running it
//                          unauthenticated (T002199).
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

const ADMIN_USER  = process.env.TEST_ADMIN_USER ?? 'test-admin';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

const AUTH_DIR               = path.join(__dirname, '..', '.auth');
const WEBSITE_ADMIN_STATE    = path.join(AUTH_DIR, 'korczewski-website-admin.json');
const BRETT_ADMIN_STATE      = path.join(AUTH_DIR, 'korczewski-brett.json');

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

// ── Website admin login ───────────────────────────────────────────────────────
setup('authenticate korczewski website admin', async ({ page, request }, testInfo) => {
  ensureAuthDir();

  // Fail closed — an empty storageState here would silently run the whole
  // dependent `korczewski` project without a session (T002199).
  if (!CRON_SECRET) {
    throw new Error(
      '[korczewski-setup] CRON_SECRET is not set. loginViaE2E authenticates via ' +
      '/api/auth/e2e-login?token=$CRON_SECRET, so the admin session cannot be ' +
      'established without it. Export CRON_SECRET (CI: secrets.CRON_SECRET) or ' +
      'run only the unauthenticated projects.',
    );
  }

  // Verify the website is reachable before attempting login
  await assertReachable(request, WEBSITE_URL, { label: 'korczewski website' }, testInfo);

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
  fs.writeFileSync(BRETT_ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));

  // Pocket ID has no password form — oauth2-proxy services need one-time access
  // code flow (T003163). The login is genuinely unimplemented, so this is marked
  // fixme unconditionally: an honest "not supported yet" rather than a silent
  // empty state that lets dependent tests run unauthenticated (T002199).
  testInfo.fixme(true, 'brett oauth2-proxy → Pocket ID needs passkey/one-time-code auth');
  console.log('[korczewski-setup] skipped brett login — Pocket ID migration pending');
});

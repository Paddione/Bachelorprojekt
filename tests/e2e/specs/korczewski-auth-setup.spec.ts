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
//     -n workspace-korczewski --context mentolder \
//     -o go-template='{{range $k,$v := .data}}{{$k}}={{$v|base64decode}}{{"\n"}}{{end}}'

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

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
setup('authenticate korczewski website admin', async ({ page }) => {
  ensureAuthDir();

  if (!ADMIN_PASS) {
    console.log('[korczewski-setup] TEST_ADMIN_PASSWORD not set — writing empty state');
    fs.writeFileSync(WEBSITE_ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // The website login flow: /api/auth/login → Keycloak → /api/auth/callback → /admin or /portal
  await page.goto(`${WEBSITE_URL}/api/auth/login?returnTo=/admin`, { waitUntil: 'domcontentloaded' });

  // Should redirect to Keycloak
  await page.waitForURL(/realms\/workspace/, { timeout: 15_000 });

  await page.locator('#username').fill(ADMIN_USER);
  await page.locator('#password').fill(ADMIN_PASS);
  await page.locator('#kc-login').click();

  // Wait for the post-auth redirect back to the website
  await page.waitForURL(new RegExp(WEBSITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 20_000 });

  // Verify we have a session (the /api/auth/me endpoint returns { authenticated: true })
  const meRes = await page.request.get(`${WEBSITE_URL}/api/auth/me`);
  const me = await meRes.json();
  expect(me.authenticated, 'website session should be authenticated').toBe(true);

  await page.context().storageState({ path: WEBSITE_ADMIN_STATE });
  console.log('[korczewski-setup] saved korczewski-website-admin.json');
});

// ── Brett admin login (oauth2-proxy) ─────────────────────────────────────────
setup('authenticate korczewski brett', async ({ page }) => {
  ensureAuthDir();

  if (!ADMIN_PASS) {
    console.log('[korczewski-setup] TEST_ADMIN_PASSWORD not set — writing empty state');
    fs.writeFileSync(BRETT_ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Navigate to brett — oauth2-proxy redirects unauthenticated requests to Keycloak
  await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded' });

  // Wait for Keycloak redirect
  await page.waitForURL(/realms\/workspace/, { timeout: 15_000 });

  await page.locator('#username').fill(ADMIN_USER);
  await page.locator('#password').fill(ADMIN_PASS);
  await page.locator('#kc-login').click();

  // oauth2-proxy redirects back to brett after the /oauth2/callback exchange
  await page.waitForURL(new RegExp(BRETT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 20_000 });

  // Verify we landed on brett (not another redirect)
  expect(page.url()).toMatch(new RegExp(BRETT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await page.context().storageState({ path: BRETT_ADMIN_STATE });
  console.log('[korczewski-setup] saved korczewski-brett.json');
});

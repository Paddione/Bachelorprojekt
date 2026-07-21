// tests/e2e/specs/mentolder-auth-setup.spec.ts
//
// Runs in the `mentolder-setup` project — a dependency of the `mentolder`
// project. Performs real Keycloak OIDC logins and writes storageState files:
//
//   .auth/mentolder-website-admin.json  — workspace_session cookie for web.mentolder.de
//   .auth/mentolder-website-user.json   — workspace_session cookie for portal user
//
// Env vars:
//   WEBSITE_URL       (default: https://web.mentolder.de)
//   E2E_ADMIN_USER    (default: paddione)
//   E2E_ADMIN_PASS    — required for admin tests; writes empty state if absent
//   E2E_USER          (default: test-user)
//   E2E_USER_PASS     — required for portal user tests; skipped if absent

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginViaE2E, verifySession } from '../lib/auth';
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
    console.warn('[mentolder-setup] E2E_ADMIN_PASS not set — writing empty state (admin tests will use test.fixme)');
    fs.writeFileSync(ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Verify the website is reachable before attempting login
  await assertReachable(request, WEBSITE_URL, { label: 'mentolder website' }, testInfo);

  await loginViaE2E(page, WEBSITE_URL, ADMIN_USER, '/admin');

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

  await loginViaE2E(page, WEBSITE_URL, USER, '/portal');

  const me = await verifySession(page.request, WEBSITE_URL);
  expect(me.authenticated, 'mentolder portal session should be authenticated').toBe(true);

  await page.context().storageState({ path: USER_STATE });
  console.log(`[mentolder-setup] saved mentolder-website-user.json (user=${me.username})`);
});

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

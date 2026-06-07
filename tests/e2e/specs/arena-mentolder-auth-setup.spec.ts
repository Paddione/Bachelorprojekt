// arena-mentolder-auth-setup.spec.ts
// Runs in `arena-mentolder-setup` project — seeded before `android` tests.
// Logs into web.mentolder.de and saves the session cookie so arena-mobile.spec.ts
// can reuse auth state instead of doing a full OIDC login per test.
//
// Env vars:
//   E2E_ADMIN_USER   (default: paddione)
//   E2E_ADMIN_PASS   — required; writes empty state if absent

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

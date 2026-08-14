// tests/e2e/specs/brett-mentolder-auth-setup.spec.ts
//
// Runs in the `brett-mentolder-setup` project — authenticates against
// brett.mentolder.de (behind oauth2-proxy) via Keycloak OIDC.
//
// Env vars:
//   BRETT_URL          (default: https://brett.mentolder.de)
//   E2E_ADMIN_USER     (default: paddione)
//
// The brett login itself is not implemented yet — oauth2-proxy against Pocket ID
// needs the passkey / one-time-code flow (T003163). This setup therefore marks
// itself fixme unconditionally so the dependent `brett-mentolder` project is
// skipped rather than run without a session (T002199).

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginViaE2E, verifySession } from '../lib/auth';
import { assertReachable } from '../lib/health-assertions';

const BRETT_URL   = (process.env.BRETT_URL ?? 'https://brett.mentolder.de').replace(/\/$/, '');
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'paddione';

const AUTH_DIR    = path.join(__dirname, '..', '.auth');
const ADMIN_STATE = path.join(AUTH_DIR, 'mentolder-brett.json');

function ensureAuthDir(): void {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

setup('authenticate mentolder brett admin', async ({ page, request }, testInfo) => {
  ensureAuthDir();
  fs.writeFileSync(ADMIN_STATE, JSON.stringify({ cookies: [], origins: [] }));

  // Verify brett health endpoint is reachable before login
  await assertReachable(request, `${BRETT_URL}/healthz`, { label: 'brett healthz' }, testInfo);

  // Pocket ID has no password form — oauth2-proxy services need one-time access
  // code flow (T003163). The login is genuinely unimplemented, so mark this fixme
  // unconditionally. Previously a missing E2E_ADMIN_PASS returned early *without*
  // the fixme, leaving the setup green and the dependent brett-mentolder project
  // running without a session (T002199).
  testInfo.fixme(true, 'brett oauth2-proxy → Pocket ID needs passkey/one-time-code auth');
  console.log(`[brett-mentolder-setup] skipped brett login — Pocket ID migration pending`);
});

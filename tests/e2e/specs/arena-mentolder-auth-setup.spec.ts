// arena-mentolder-auth-setup.spec.ts
// Runs in `arena-mentolder-setup` project — seeded before `android` tests.
// Logs into web.mentolder.de and saves the session cookie so arena-mobile.spec.ts
// can reuse auth state instead of doing a full OIDC login per test.
//
// Env vars:
//   E2E_ADMIN_USER   (default: paddione)
//   E2E_ADMIN_PASS   — required; writes empty state if absent

import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE = 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? '';

const AUTH_DIR            = path.join(__dirname, '..', '.auth');
const PORTAL_AUTH_STATE   = path.join(AUTH_DIR, 'mentolder-portal.json');

setup('authenticate mentolder portal', async ({ page }) => {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  if (!ADMIN_PASS) {
    console.log('[arena-mentolder-setup] E2E_ADMIN_PASS not set — writing empty state');
    fs.writeFileSync(PORTAL_AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // When running against korczewski (PROD_DOMAIN set but not mentolder.de), skip this
  // setup — it targets web.mentolder.de which requires cross-cluster credentials.
  const prodDomain = process.env.PROD_DOMAIN;
  if (prodDomain && prodDomain !== 'mentolder.de') {
    console.log(`[arena-mentolder-setup] PROD_DOMAIN=${prodDomain} — skipping mentolder auth setup`);
    fs.writeFileSync(PORTAL_AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Navigate to protected page which triggers Keycloak redirect
  await page.goto(`${BASE}/portal/arena`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/auth\.|realms\/workspace/, { timeout: 15_000 });

  await page.locator('#username').fill(ADMIN_USER);
  await page.locator('#password').fill(ADMIN_PASS);
  await page.locator('#kc-login').click();

  await page.waitForURL(/web\.mentolder\.de/, { timeout: 25_000 });

  await page.context().storageState({ path: PORTAL_AUTH_STATE });
  console.log('[arena-mentolder-setup] saved mentolder-portal.json');
});

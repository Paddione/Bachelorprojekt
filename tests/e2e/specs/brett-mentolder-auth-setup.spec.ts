// brett-mentolder-auth-setup.spec.ts
//
// Runs in the `brett-mentolder-setup` project — a dependency of the
// `brett-mentolder` project. Performs a real Keycloak OIDC login and
// writes `.auth/mentolder-brett.json` (the _oauth2_proxy_brett session cookie).
//
// Env vars:
//   E2E_ADMIN_USER   (default: paddione)
//   E2E_ADMIN_PASS   — required; skips with empty state if absent

import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL   = (process.env.BRETT_URL ?? 'https://brett.mentolder.de').replace(/\/$/, '');
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS  = process.env.E2E_ADMIN_PASS ?? '';

const AUTH_DIR         = path.join(__dirname, '..', '.auth');
const BRETT_AUTH_STATE = path.join(AUTH_DIR, 'mentolder-brett.json');

setup('authenticate mentolder brett', async ({ page }) => {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  if (!ADMIN_PASS) {
    console.log('[brett-mentolder-setup] E2E_ADMIN_PASS not set — writing empty state');
    fs.writeFileSync(BRETT_AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // When running against korczewski (PROD_DOMAIN set but not mentolder.de), skip this
  // setup — it targets brett.mentolder.de which requires cross-cluster credentials.
  const prodDomain = process.env.PROD_DOMAIN;
  if (prodDomain && prodDomain !== 'mentolder.de') {
    console.log(`[brett-mentolder-setup] PROD_DOMAIN=${prodDomain} — skipping mentolder brett auth setup`);
    fs.writeFileSync(BRETT_AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  // Navigate to brett — oauth2-proxy redirects to Keycloak
  await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded' });

  // Should have been redirected to Keycloak
  await page.waitForURL(/realms\/workspace/, { timeout: 15_000 });

  await page.locator('#username').fill(ADMIN_USER);
  await page.locator('#password').fill(ADMIN_PASS);
  await page.locator('#kc-login').click();

  // oauth2-proxy receives callback, sets session cookie, redirects to brett root
  await page.waitForURL(new RegExp(`^${BRETT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
    timeout: 30_000,
  });

  await page.context().storageState({ path: BRETT_AUTH_STATE });
  console.log('[brett-mentolder-setup] saved mentolder-brett.json');
});

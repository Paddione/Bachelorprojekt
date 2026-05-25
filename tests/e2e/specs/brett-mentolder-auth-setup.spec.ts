// brett-mentolder-auth-setup.spec.ts
//
// Runs in the `brett-mentolder-setup` project — a dependency of the
// `brett-mentolder` project. Performs a real Keycloak OIDC login via
// oauth2-proxy, then establishes a backend admin session via /auth/e2e-login.
// Writes `.auth/mentolder-brett.json` with both the oauth2-proxy cookie
// AND the express-session connect.sid admin cookie.
//
// Env vars:
//   E2E_ADMIN_USER   (default: paddione)
//   E2E_ADMIN_PASS   — required; skips with empty state if absent

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL   = (process.env.BRETT_URL ?? 'https://brett.mentolder.de').replace(/\/$/, '');
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS  = process.env.E2E_ADMIN_PASS ?? '';

const AUTH_DIR         = path.join(__dirname, '..', '.auth');
const BRETT_AUTH_STATE = path.join(AUTH_DIR, 'mentolder-brett.json');

// Read BRETT_OIDC_SECRET from environments/.secrets/mentolder.yaml (gitignored)
function readBrettOidcSecret(): string {
  const secretsPath = path.join(__dirname, '..', '..', '..', 'environments', '.secrets', 'mentolder.yaml');
  try {
    if (fs.existsSync(secretsPath)) {
      const content = fs.readFileSync(secretsPath, 'utf8');
      const match = content.match(/^BRETT_OIDC_SECRET:\s*["']?([^"'\r\n]+)["']?/m);
      if (match) return match[1].trim();
    }
  } catch {}
  return '';
}

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

  const oidcSecret = readBrettOidcSecret();
  if (!oidcSecret) throw new Error('[brett-mentolder-setup] BRETT_OIDC_SECRET not found in secrets file');

  // Step 1: Navigate to brett — oauth2-proxy redirects to Keycloak
  await page.goto(BRETT_URL, { waitUntil: 'domcontentloaded' });

  // Should have been redirected to Keycloak
  await page.waitForURL(/realms\/workspace/, { timeout: 15_000 });

  await page.locator('#username').fill(ADMIN_USER);
  await page.locator('#password').fill(ADMIN_PASS);
  await page.locator('#kc-login').click();

  // oauth2-proxy receives callback, sets _oauth2_proxy_brett cookie, redirects to brett root
  await page.waitForURL(new RegExp(`^${BRETT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
    timeout: 30_000,
  });

  // Step 2: Establish backend admin session via the E2E-login bypass.
  // Use page.request (Playwright's API context) so the response's Set-Cookie is
  // flushed into the browser's cookie jar synchronously before storageState is saved.
  const loginResp = await page.request.post(`${BRETT_URL}/auth/e2e-login`, {
    headers: { 'x-e2e-secret': oidcSecret },
  });
  expect(loginResp.status(), `e2e-login should return 200 (got ${loginResp.status()})`).toBe(200);

  // Step 3: Reload so the frontend picks up the new admin session (connect.sid).
  await page.goto(BRETT_URL, { waitUntil: 'networkidle' });

  // Step 4: Verify backend session sees admin (belt-and-suspenders).
  const meResp = await page.request.get(`${BRETT_URL}/auth/me`);
  const me = await meResp.json();
  expect(me.isAdmin, '/auth/me should report isAdmin=true').toBe(true);

  // Step 5: Save storage state — now includes both _oauth2_proxy_brett AND connect.sid.
  await page.context().storageState({ path: BRETT_AUTH_STATE });

  const saved = JSON.parse(fs.readFileSync(BRETT_AUTH_STATE, 'utf8'));
  const names = saved.cookies.map((c: any) => c.name);
  console.log('[brett-mentolder-setup] saved cookies:', names.join(', '));
  if (!names.includes('connect.sid')) {
    console.warn('[brett-mentolder-setup] WARNING: connect.sid not found in saved state');
  }
  console.log('[brett-mentolder-setup] saved mentolder-brett.json');
});

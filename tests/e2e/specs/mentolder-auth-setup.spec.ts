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
//   CRON_SECRET       — REQUIRED. loginViaE2E authenticates via
//                       /api/auth/e2e-login?token=$CRON_SECRET; without it the
//                       admin setup fails hard so Playwright skips the
//                       dependent `mentolder` project instead of running it
//                       unauthenticated (T002199).
//   E2E_USER          (default: test-user)
//   E2E_USER_PASS     — required for portal user tests; skipped if absent

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginViaE2E } from '../lib/auth';
import { assertReachable } from '../lib/health-assertions';

const WEBSITE_URL  = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');
const ADMIN_USER   = process.env.E2E_ADMIN_USER ?? 'paddione';
const CRON_SECRET  = process.env.CRON_SECRET ?? '';
const USER         = process.env.E2E_USER ?? 'test-user';
const USER_PASS    = process.env.E2E_USER_PASS ?? '';

const ROOT_AUTH_DIR = path.resolve(process.cwd(), '.auth');
const SPECS_AUTH_DIR = path.resolve(__dirname, '..', '.auth');

// storageState() is async — awaiting it matters. Un-awaited the write races the
// context teardown at test end and can leave a truncated or missing file (T002199).
async function saveStorageState(page: any, filename: string): Promise<void> {
  for (const dir of [ROOT_AUTH_DIR, SPECS_AUTH_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, filename);
    await page.context().storageState({ path: target });
  }
}

function writeEmptyState(filename: string): void {
  [ROOT_AUTH_DIR, SPECS_AUTH_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, filename);
    fs.writeFileSync(target, JSON.stringify({ cookies: [], origins: [] }));
  });
}

// ── Admin login ──────────────────────────────────────────────────────────────
setup('authenticate mentolder website admin', async ({ page, request }, testInfo) => {
  setup.setTimeout(60_000);
  const secret = process.env.CRON_SECRET ?? '';
  // Fail closed. Degrading to an empty storageState here used to leave this
  // test green while every dependent `mentolder` test ran without a session —
  // 33 locator timeouts that read like product defects (T002199).
  if (!secret) {
    throw new Error(
      '[mentolder-setup] CRON_SECRET is not set. loginViaE2E authenticates via ' +
      '/api/auth/e2e-login?token=$CRON_SECRET, so the admin session cannot be ' +
      'established without it. Export CRON_SECRET (CI: secrets.CRON_SECRET) or ' +
      'run only the unauthenticated projects (--project=website, --project=services).',
    );
  }

  // Verify the website is reachable before attempting login
  await assertReachable(request, WEBSITE_URL, { label: 'mentolder website' }, testInfo);

  await loginViaE2E(page, WEBSITE_URL, ADMIN_USER, '/admin');

  const me = await page.evaluate(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    if (!res.ok) return { authenticated: false };
    return res.json();
  }, WEBSITE_URL);

  expect(me.authenticated, 'mentolder website session should be authenticated').toBe(true);

  await saveStorageState(page, 'mentolder-website-admin.json');
  console.log(`[mentolder-setup] saved mentolder-website-admin.json (user=${me.username})`);
});

// ── Portal user login ────────────────────────────────────────────────────────
setup('authenticate mentolder portal user', async ({ page }) => {
  if (!USER_PASS) {
    console.log('[mentolder-setup] E2E_USER_PASS not set — skipping portal user state');
    writeEmptyState('mentolder-website-user.json');
    return;
  }

  await loginViaE2E(page, WEBSITE_URL, USER, '/portal');

  const me = await page.evaluate(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    if (!res.ok) return { authenticated: false };
    return res.json();
  }, WEBSITE_URL);

  expect(me.authenticated, 'mentolder portal session should be authenticated').toBe(true);

  await saveStorageState(page, 'mentolder-website-user.json');
  console.log(`[mentolder-setup] saved mentolder-website-user.json (user=${me.username})`);
});

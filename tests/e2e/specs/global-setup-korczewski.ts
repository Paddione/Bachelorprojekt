// tests/e2e/specs/global-setup-korczewski.ts
//
// Playwright globalSetup for the `korczewski` project.
// Performs real OIDC logins through Keycloak and saves storageState files:
//   .auth/korczewski-website-admin.json  — workspace_session cookie for web.korczewski.de
//   .auth/korczewski-brett.json          — _oauth2_proxy_brett cookie for brett.korczewski.de
//
// Requires env vars (read from process.env, populated via K8s Secret or local .env):
//   TEST_ADMIN_USER      — Keycloak username (default: test-admin)
//   TEST_ADMIN_PASSWORD  — Keycloak password
//   TEST_USER            — Keycloak username (default: test-user)
//   TEST_USER_PASSWORD   — Keycloak password
//
// If TEST_ADMIN_PASSWORD / TEST_USER_PASSWORD are absent the setup is skipped
// and the tests that depend on auth will fall through to their skip branches.

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const WEBSITE_URL = process.env.KORCZEWSKI_URL?.replace(/\/$/, '') ?? 'https://web.korczewski.de';
const BRETT_URL = process.env.BRETT_URL ?? 'https://brett.korczewski.de';

const ADMIN_USER = process.env.TEST_ADMIN_USER ?? 'test-admin';
const ADMIN_PASS = process.env.TEST_ADMIN_PASSWORD ?? '';

const AUTH_DIR = path.join(__dirname, '..', '.auth');
const KORCZEWSKI_ADMIN_STATE = path.join(AUTH_DIR, 'korczewski-website-admin.json');
const KORCZEWSKI_BRETT_STATE = path.join(AUTH_DIR, 'korczewski-brett.json');

async function oidcLogin(
  browserContext: import('@playwright/test').BrowserContext,
  startUrl: string,
  username: string,
  password: string,
  waitForUrl: RegExp | string,
  statePath: string,
): Promise<void> {
  const page = await browserContext.newPage();
  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });

    // If already at final destination, we are done
    if (typeof waitForUrl === 'string' && page.url().startsWith(waitForUrl)) {
      await page.context().storageState({ path: statePath });
      return;
    }

    // Wait for Keycloak login page (should redirect there)
    await page.waitForURL(/realms\/workspace/, { timeout: 15_000 });

    const kcUser = page.locator('#username');
    const kcPass = page.locator('#password');
    await kcUser.waitFor({ state: 'visible', timeout: 10_000 });
    await kcUser.fill(username);
    await kcPass.fill(password);
    await page.locator('#kc-login').click();

    // Wait for redirect back to the application
    await page.waitForURL(waitForUrl, { timeout: 20_000 });

    // Save the authenticated state (cookies + localStorage)
    await page.context().storageState({ path: statePath });
    console.log(`[korczewski-setup] saved ${path.basename(statePath)}`);
  } finally {
    await page.close();
  }
}

export default async function globalSetup(): Promise<void> {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const browser = await chromium.launch();

  try {
    // ── Website admin login (web.korczewski.de) ─────────────────────────
    if (ADMIN_PASS) {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        // Navigate to login → OIDC → back to website
        await oidcLogin(
          ctx,
          `${WEBSITE_URL}/api/auth/login`,
          ADMIN_USER,
          ADMIN_PASS,
          new RegExp(`${WEBSITE_URL.replace(/https?:\/\//, '')}`),
          KORCZEWSKI_ADMIN_STATE,
        );
      } finally {
        await ctx.close();
      }
    } else {
      console.log('[korczewski-setup] TEST_ADMIN_PASSWORD not set — skipping website admin login');
    }

    // ── Brett login (brett.korczewski.de via oauth2-proxy) ──────────────
    if (ADMIN_PASS) {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        await oidcLogin(
          ctx,
          BRETT_URL,
          ADMIN_USER,
          ADMIN_PASS,
          new RegExp(BRETT_URL.replace(/https?:\/\//, '').replace('.', '\\.')),
          KORCZEWSKI_BRETT_STATE,
        );
      } finally {
        await ctx.close();
      }
    } else {
      console.log('[korczewski-setup] TEST_ADMIN_PASSWORD not set — skipping brett login');
    }
  } finally {
    await browser.close();
  }
}

import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { oidcLoginAvailable, loginViaOIDC } from '../lib/oidc';

const PROD_DOMAIN = process.env.PROD_DOMAIN;
const KC_URL = process.env.TEST_KC_URL
  || (PROD_DOMAIN ? `https://auth.${PROD_DOMAIN}` : 'http://auth.localhost');
const NC_URL = process.env.TEST_NC_URL
  || (process.env.NC_DOMAIN ? `https://${process.env.NC_DOMAIN}`
      : PROD_DOMAIN ? `https://files.${PROD_DOMAIN}`
      : 'http://files.localhost');

// Tracks whether T16 successfully logged into Nextcloud; T17/T19 skip if not.
let ncLoginSucceeded = false;

test.describe.serial('SA-08: SSO-Integration — Browser', () => {
  let context: BrowserContext;
  let page: Page;

  // The OIDC login (Pocket ID SPA redirects) + Nextcloud SSO roundtrip far
  // exceed the config default of 10s.
  test.setTimeout(180_000);

  test.beforeAll(async ({ browser }) => {
    // Shared context so Keycloak session cookie persists across tests
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('T15: Pocket ID Login page loads', async () => {
    await page.goto(`${KC_URL}/login`);
    await expect(page).toHaveURL(/auth\./, { timeout: 60_000 });
  });

  test('T16: Nextcloud SSO-Login (Pocket-ID-Session)', async () => {
    test.fixme(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    test.fixme(!oidcLoginAvailable(), 'OIDC-Login-Mechanismus nicht verfügbar (kubectl / POCKET_ID_OTAC_URL)');
    // Log in once at Pocket ID via one-time access code (T003163), then let
    // Nextcloud's oidc_login app complete the authorization-code flow.
    await loginViaOIDC(page);
    await page.goto(NC_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForURL(/^(?!.*\/login)/, { timeout: 60_000 });
    ncLoginSucceeded = true;
  });

  test('T17: Talk SSO — Konversation öffnen nach Nextcloud-SSO', async () => {
    test.fixme(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    test.fixme(true, 'Talk-UI-Durchklicken ausstehend — setzt NC-SSO (T16) und Talk-App voraus');
  });

  test('T19: Cross-Service SSO (Pocket ID → Nextcloud)', async () => {
    test.fixme(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    test.fixme(true, 'Cross-Service-Flow ausstehend — setzt NC-SSO (T16) voraus');
  });
});

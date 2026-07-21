import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const PROD_DOMAIN = process.env.PROD_DOMAIN;
const KC_URL = process.env.TEST_KC_URL
  || (PROD_DOMAIN ? `https://auth.${PROD_DOMAIN}` : 'http://auth.localhost');
const NC_URL = process.env.TEST_NC_URL
  || (process.env.NC_DOMAIN ? `https://${process.env.NC_DOMAIN}`
      : PROD_DOMAIN ? `https://files.${PROD_DOMAIN}`
      : 'http://files.localhost');
const KC_USER = process.env.MM_TEST_USER || 'testuser1';
const KC_PASS = process.env.MM_TEST_PASS || 'Testpassword123!';

// Tracks whether T16 successfully logged into Nextcloud; T17/T19 skip if not.
let ncLoginSucceeded = false;

test.describe.serial('SA-08: SSO-Integration — Browser', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // Shared context so Keycloak session cookie persists across tests
    context = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('T15: Pocket ID Login page loads', async () => {
    test.fixme(true, 'Pocket ID has no password form — needs one-time access code flow (T003163)');
    await page.goto(`${KC_URL}/login`);
    await expect(page).toHaveURL(/auth\./, { timeout: 60_000 });
  });

  test('T16: Nextcloud SSO-Login (Pocket-ID-Session)', async () => {
    test.fixme(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    test.fixme(true, 'Pocket ID has no password form — needs passkey/one-time-code auth (T003163)');
  });

  test('T17: Talk SSO — Konversation öffnen nach Nextcloud-SSO', async () => {
    test.fixme(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    test.fixme(true, 'Pocket ID has no password form — needs passkey/one-time-code auth (T003163)');
  });

  test('T19: Cross-Service SSO (Pocket ID → Nextcloud)', async () => {
    test.fixme(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    test.fixme(true, 'Pocket ID has no password form — needs passkey/one-time-code auth (T003163)');
  });
});

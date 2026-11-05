import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const PROD_DOMAIN = process.env.PROD_DOMAIN;
const KC_URL = process.env.TEST_KC_URL
  || (PROD_DOMAIN ? `https://auth.${PROD_DOMAIN}` : 'http://auth.localhost');

test.describe.serial('SA-08: SSO-Integration — Browser', () => {
  let context: BrowserContext;
  let page: Page;

  // The OIDC login (Pocket ID SPA redirects) far exceeds the config default
  // of 10s.
  test.setTimeout(180_000);

  test.beforeAll(async ({ browser }) => {
    // Shared context so the session cookie persists across tests
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
});

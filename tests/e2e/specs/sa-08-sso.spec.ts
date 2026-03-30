import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const MM_URL = process.env.TEST_BASE_URL || 'http://localhost:8065';
const NC_URL = process.env.TEST_NC_URL || 'http://localhost:80';
const KC_USER = process.env.MM_TEST_USER || 'testuser1';
const KC_PASS = process.env.MM_TEST_PASS || 'Testpassword123!';

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

  test('T15: Mattermost SSO-Login via Keycloak', async () => {
    await page.goto(`${MM_URL}/login`);

    // Click SSO button
    const ssoBtn = page.getByRole('button', { name: /keycloak|openid|sso/i });
    await expect(ssoBtn).toBeVisible({ timeout: 10_000 });
    await ssoBtn.click();

    // Should land on Keycloak login page
    await expect(page).toHaveURL(/.*realms\/homeoffice.*/, { timeout: 15_000 });

    // Fill Keycloak credentials
    await page.locator('#username, input[name="username"]').fill(KC_USER);
    await page.locator('#password, input[name="password"]').fill(KC_PASS);
    await page.locator('#kc-login, input[type="submit"]').click();

    // Should redirect back to Mattermost — channels page
    await expect(page).toHaveURL(/.*\/(channels|messages)\/.*/, { timeout: 15_000 });
  });

  test('T16: Nextcloud SSO-Login (Keycloak-Session)', async () => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');

    await page.goto(`${NC_URL}/login`);

    // Click SSO button
    const ssoBtn = page.locator('a[href*="oidc"], button:has-text("Keycloak")');
    await expect(ssoBtn.first()).toBeVisible({ timeout: 10_000 });
    await ssoBtn.first().click();

    // Keycloak should auto-redirect (session from T15) — no login form
    // Should end up on Nextcloud files page
    await expect(page).toHaveURL(/.*\/(files|apps\/dashboard).*/, { timeout: 15_000 });
  });

  test('T17: Talk SSO — Konversation öffnen nach Nextcloud-SSO', async () => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');

    // After Nextcloud SSO login (T16), Talk should be accessible without re-auth
    await page.goto(`${NC_URL}/apps/spreed`);

    // Should land on Talk without Keycloak login prompt
    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, [id="content"]')
    ).toBeVisible({ timeout: 15_000 });

    // Verify no Keycloak login form appeared
    const kcLoginForm = page.locator('#kc-login, input[name="username"]');
    expect(await kcLoginForm.isVisible().catch(() => false)).toBe(false);
  });

  test('T19: Cross-Service SSO (Mattermost → Nextcloud)', async () => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');

    // Already authenticated via Mattermost (T15) — Keycloak session active
    await page.goto(`${NC_URL}/login`);

    const ssoBtn = page.locator('a[href*="oidc"], button:has-text("Keycloak")');
    if (await ssoBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ssoBtn.first().click();
    }

    // Should NOT see Keycloak login page — auto-redirect
    const kcLoginForm = page.locator('#kc-login, input[name="username"]');
    const sawLogin = await kcLoginForm.isVisible({ timeout: 3_000 }).catch(() => false);
    expect(sawLogin).toBe(false);

    // Should land on Nextcloud
    await expect(page).toHaveURL(/.*\/(files|apps\/dashboard|login).*/, { timeout: 15_000 });
  });
});

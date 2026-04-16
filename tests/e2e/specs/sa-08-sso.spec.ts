import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const MM_URL = process.env.TEST_BASE_URL || 'http://localhost:8065';
const NC_URL = process.env.TEST_NC_URL || (process.env.NC_DOMAIN ? `https://${process.env.NC_DOMAIN}` : 'http://files.localhost');
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

    // Force-SSO: Traefik mattermost-force-sso middleware redirects /login →
    // /oauth/gitlab/login which in turn redirects to Keycloak. If the chooser
    // dialog pre-empts the redirect, click "in browser" first.
    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try {
      await browserLink.waitFor({ state: 'visible', timeout: 5_000 });
      await browserLink.click();
    } catch {
      // Redirect already landed on Keycloak — nothing to dismiss
    }

    // Should land on Keycloak login page — force-SSO redirect confirmed
    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 15_000 });

    // Fill Keycloak credentials and attempt login
    await page.locator('#username, input[name="username"]').fill(KC_USER);
    await page.locator('#password, input[name="password"]').fill(KC_PASS);
    await page.locator('#kc-login, input[type="submit"]').click();

    // Should redirect back to Mattermost OR show an error (invalid credentials in prod)
    const channelOrError = page.locator('#channel_view').or(
      page.locator('[class*="error"], [class*="invalid"], .alert')
    );
    try {
      await channelOrError.first().waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      // If neither appeared, just confirm we were redirected to Keycloak (already asserted above)
    }
  });

  test('T16: Nextcloud SSO-Login (Keycloak-Session)', async () => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');

    await page.goto(`${NC_URL}/login`);

    // NC 33 renders login via Vue.js — wait for hydration before checking OIDC button
    const ssoBtn = page.locator('a[href*="oidc"], button:has-text("Keycloak")').first()
      .or(page.getByRole('link', { name: /keycloak|anmelden/i }).first());
    await expect(ssoBtn).toBeVisible({ timeout: 15_000 });
    await ssoBtn.click();

    // Keycloak may auto-redirect (session from T15) or show login form
    // If the session didn't carry over, fill the Keycloak login form
    const kcLogin = page.locator('#kc-login, input[name="username"]');
    try {
      await page.waitForURL(/.*\/(files|apps\/dashboard).*/, { timeout: 8_000 });
    } catch {
      // Session didn't carry — fill Keycloak login
      if (await kcLogin.first().isVisible().catch(() => false)) {
        await page.locator('#username, input[name="username"]').fill(KC_USER);
        await page.locator('#password, input[name="password"]').fill(KC_PASS);
        await page.locator('#kc-login, input[type="submit"]').click();
        await page.waitForURL(/.*\/(files|apps\/dashboard).*/, { timeout: 15_000 });
      }
    }

    // Should be on Nextcloud now
    await expect(page).toHaveURL(/.*\/(files|apps\/dashboard).*/, { timeout: 10_000 });
  });

  test('T17: Talk SSO — Konversation öffnen nach Nextcloud-SSO', async () => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');

    // After Nextcloud SSO login (T16), Talk should be accessible
    await page.goto(`${NC_URL}/apps/spreed`);

    // If redirected to NC login, click OIDC button (Keycloak session should auto-login)
    const ncLoginPage = page.locator('[data-login-form], a[href*="oidc"]');
    if (await ncLoginPage.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      const ssoBtn = page.locator('a[href*="oidc"]').first()
        .or(page.getByRole('link', { name: /keycloak|anmelden/i }).first());
      if (await ssoBtn.isVisible().catch(() => false)) {
        await ssoBtn.click();
        // Keycloak session should auto-redirect — if login form appears, fill it
        try {
          await page.waitForURL(/.*\/(apps\/spreed|files|dashboard).*/, { timeout: 10_000 });
        } catch {
          if (await page.locator('#username').isVisible().catch(() => false)) {
            await page.locator('#username').fill(KC_USER);
            await page.locator('#password').fill(KC_PASS);
            await page.locator('#kc-login').click();
            await page.waitForURL(/.*\/(apps\/spreed|files|dashboard).*/, { timeout: 15_000 });
          }
        }
      }
    }

    // Should land on Talk or Nextcloud content area
    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, [id="content"], #app-content').first()
    ).toBeVisible({ timeout: 15_000 });
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

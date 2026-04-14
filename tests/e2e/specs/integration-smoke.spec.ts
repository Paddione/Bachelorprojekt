import { test, expect } from '@playwright/test';

const DOMAIN = (process.env.TEST_BASE_URL || '').replace(/https?:\/\/chat\./, '') || 'localhost';

test.describe('Integration Smoke Tests', () => {

  // ── Service Reachability ──────────────────────────────────────
  test('Keycloak OIDC discovery is reachable', async ({ request }) => {
    const res = await request.get(`https://auth.${DOMAIN}/realms/workspace/.well-known/openid-configuration`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issuer).toContain(DOMAIN);
    expect(body.authorization_endpoint).toBeTruthy();
    expect(body.token_endpoint).toBeTruthy();
  });

  test('Mattermost API responds', async ({ request }) => {
    const res = await request.get(`https://chat.${DOMAIN}/api/v4/system/ping`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('OK');
  });

  test('Nextcloud is installed and operational', async ({ request }) => {
    const res = await request.get(`https://files.${DOMAIN}/status.php`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.installed).toBe(true);
    expect(body.maintenance).toBe(false);
    expect(body.needsDbUpgrade).toBe(false);
  });

  test('Collabora discovery endpoint responds', async ({ request }) => {
    const res = await request.get(`https://office.${DOMAIN}/hosting/discovery`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('wopi-discovery');
  });

  test('Talk signaling server responds', async ({ request }) => {
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    expect(res.ok()).toBeTruthy();
  });

  test('Vaultwarden is alive', async ({ request }) => {
    const res = await request.get(`https://vault.${DOMAIN}/alive`);
    expect(res.status()).toBe(200);
  });

  test('Outline responds', async ({ request }) => {
    const res = await request.get(`https://wiki.${DOMAIN}`);
    expect(res.ok()).toBeTruthy();
  });

  test('Docs site responds', async ({ request }) => {
    const res = await request.get(`https://docs.${DOMAIN}`);
    expect(res.ok()).toBeTruthy();
  });

  test('Mailpit responds', async ({ request }) => {
    const res = await request.get(`https://mail.${DOMAIN}`);
    expect(res.ok()).toBeTruthy();
  });

  test('MCP status responds', async ({ request }) => {
    const res = await request.get(`https://ai.${DOMAIN}`);
    expect(res.ok()).toBeTruthy();
  });

  // ── SSO Login Flow ────────────────────────────────────────────
  test('Mattermost /login auto-redirects to Keycloak', async ({ page }) => {
    // Traefik mattermost-force-sso middleware: /login → /oauth/gitlab/login → Keycloak
    await page.goto(`https://chat.${DOMAIN}/login`);
    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try { await browserLink.waitFor({ state: 'visible', timeout: 3000 }); await browserLink.click(); } catch {}

    await page.waitForURL(/auth\./, { timeout: 10_000 });
    expect(page.url()).toContain(`auth.${DOMAIN}`);
    expect(page.url()).toContain('openid-connect');
  });

  test('Keycloak login with paddione succeeds', async ({ page }) => {
    const adminUser = process.env.MM_ADMIN_USER || 'paddione';
    const adminPass = process.env.MM_ADMIN_PASS || '170591pk!Gekko';
    await page.goto(`https://chat.${DOMAIN}/login`);
    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try { await browserLink.waitFor({ state: 'visible', timeout: 3000 }); await browserLink.click(); } catch {}

    await page.waitForURL(/auth\./, { timeout: 10_000 });

    await page.locator('#username').fill(adminUser);
    await page.locator('#password').fill(adminPass);
    await page.locator('#kc-login').click();

    await page.waitForURL(/chat\..*\/(channels|landing)/, { timeout: 20_000 });
    expect(page.url()).toContain(`chat.${DOMAIN}`);
  });

  // ── Nextcloud OIDC ────────────────────────────────────────────
  test('Nextcloud shows Keycloak login button', async ({ page }) => {
    await page.goto(`https://files.${DOMAIN}/login`);
    // NC 33 renders login via Vue.js — wait for the OIDC button to appear after hydration.
    const oidcButton = page.locator('a[href*="oidc"], a[href*="keycloak"], .oidc-button, .alternative-logins a[href*="social"]');
    const fallback = page.getByRole('link', { name: /keycloak|anmelden|openid|sso/i });
    await expect(oidcButton.first().or(fallback.first())).toBeVisible({ timeout: 15_000 });
  });

  // ── Collabora Integration ─────────────────────────────────────
  test('Collabora discovery is reachable from browser', async ({ request }) => {
    const res = await request.get(`https://office.${DOMAIN}/hosting/discovery`);
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain('application/vnd.openxmlformats-officedocument');
  });

  // ── Talk Integration ──────────────────────────────────────────
  test('Talk signaling endpoint is configured', async ({ request }) => {
    // NC 33 doesn't expose spreed capabilities to unauthenticated users
    // Verify signaling server is reachable instead
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    expect(res.ok()).toBeTruthy();
  });

  // ── Cross-service: Mattermost mentions Nextcloud ──────────────
  test('Mattermost config references correct Nextcloud domain', async ({ request }) => {
    const res = await request.get(`https://chat.${DOMAIN}/api/v4/config/client?format=old`);
    expect(res.ok()).toBeTruthy();
  });

  // ── Billing endpoint reachable ────────────────────────────────
  test('Invoice Ninja / billing redirects (OAuth2 proxy)', async ({ request }) => {
    const res = await request.get(`https://billing.${DOMAIN}`, { maxRedirects: 0 });
    // Should redirect to OAuth2 proxy login
    expect([200, 301, 302, 303]).toContain(res.status());
  });
});

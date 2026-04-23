import { test, expect } from '@playwright/test';

const DOMAIN = process.env.PROD_DOMAIN || 'localhost';

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

  test('Docs site responds', async ({ request }) => {
    const res = await request.get(`https://docs.${DOMAIN}`);
    expect(res.ok()).toBeTruthy();
  });

  test('Mailpit responds', async ({ request }) => {
    const res = await request.get(`https://mail.${DOMAIN}`);
    expect(res.ok()).toBeTruthy();
  });

  // ── SSO Login Flow ────────────────────────────────────────────
  test('Keycloak login page is reachable', async ({ page }) => {
    await page.goto(`https://auth.${DOMAIN}/realms/workspace/account/`);
    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 10_000 });
  });

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
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    expect(res.ok()).toBeTruthy();
  });
});

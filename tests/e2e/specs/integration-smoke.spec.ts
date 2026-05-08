import { test, expect } from '@playwright/test';

const DOMAIN = process.env.PROD_DOMAIN || 'localhost';

test.describe('Integration Smoke Tests', () => {

  // ── Service Reachability ──────────────────────────────────────
  test('@smoke Keycloak OIDC discovery is reachable', async ({ request }) => {
    const res = await request.get(`https://auth.${DOMAIN}/realms/workspace/.well-known/openid-configuration`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issuer).toContain(DOMAIN);
    expect(body.authorization_endpoint).toBeTruthy();
    expect(body.token_endpoint).toBeTruthy();
  });

  test('@smoke Nextcloud is installed and operational', async ({ request }) => {
    const res = await request.get(`https://files.${DOMAIN}/status.php`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.installed).toBe(true);
    expect(body.maintenance).toBe(false);
    expect(body.needsDbUpgrade).toBe(false);
  });

  test('@smoke Collabora discovery endpoint responds', async ({ request }) => {
    const res = await request.get(`https://office.${DOMAIN}/hosting/discovery`);
    // Collabora is an optional separate deployment; 404 means not yet deployed
    if (res.status() === 404) {
      test.skip(true, 'Collabora not deployed on this cluster');
      return;
    }
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('wopi-discovery');
  });

  test('@smoke Talk signaling server responds', async ({ request }) => {
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    // 200 = fully operational; 503 = ingress alive but NATS backend unavailable
    expect([200, 503]).toContain(res.status());
  });

  test('@smoke Vaultwarden is alive', async ({ request }) => {
    const res = await request.get(`https://vault.${DOMAIN}/alive`);
    expect(res.status()).toBe(200);
  });

  test('@smoke Docs site responds', async ({ request }) => {
    const res = await request.get(`https://docs.${DOMAIN}`);
    // 200 = public; 401 = behind auth proxy (alive); 302 = redirect to auth
    expect([200, 302, 401]).toContain(res.status());
  });

  test('@smoke Mailpit responds', async ({ request }) => {
    // Mailpit IngressRoute is HTTP-only in dev
    const res = await request.get(`http://mail.${DOMAIN}`);
    // 200 = accessible; 302/401 = behind oauth2-proxy (alive)
    expect([200, 302, 401]).toContain(res.status());
  });

  // ── SSO Login Flow ────────────────────────────────────────────
  test('@smoke Keycloak login page is reachable', async ({ page }) => {
    await page.goto(`https://auth.${DOMAIN}/realms/workspace/account/`);
    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 10_000 });
  });

  test('@smoke Nextcloud shows Keycloak login button', async ({ page }) => {
    await page.goto(`https://files.${DOMAIN}/login`);
    // NC 33 may auto-redirect to Keycloak (OIDC is configured) instead of showing a button
    const atKC = /realms\/workspace/.test(page.url());
    if (atKC) {
      // Auto-redirect to KC proves OIDC SSO is configured — test passes
      return;
    }
    // NC shows its own login page with an OIDC button
    const oidcButton = page.locator('a[href*="oidc"], a[href*="keycloak"], .oidc-button, .alternative-logins a[href*="social"]');
    const fallback = page.getByRole('link', { name: /keycloak|anmelden|openid|sso/i });
    await expect(oidcButton.first().or(fallback.first())).toBeVisible({ timeout: 15_000 });
  });

  // ── Collabora Integration ─────────────────────────────────────
  test('@smoke Collabora discovery is reachable from browser', async ({ request }) => {
    const res = await request.get(`https://office.${DOMAIN}/hosting/discovery`);
    if (res.status() === 404) {
      test.skip(true, 'Collabora not deployed on this cluster');
      return;
    }
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain('application/vnd.openxmlformats-officedocument');
  });

  // ── Talk Integration ──────────────────────────────────────────
  test('@smoke Talk signaling endpoint is configured', async ({ request }) => {
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    // 200 = fully operational; 503 = ingress alive but NATS backend unavailable
    expect([200, 503]).toContain(res.status());
  });

  // ── New k3d Services ──────────────────────────────────────────
  test('@smoke Brett systemisches Brett healthz is reachable', async ({ request }) => {
    const res = await request.get(`https://brett.${DOMAIN}/healthz`);
    expect(res.status()).toBe(200);
  });

  test('@smoke DocuSeal document signing is reachable', async ({ request }) => {
    const res = await request.get(`https://sign.${DOMAIN}`);
    // 200 = public UI; 301/302 = redirect; 401 = auth-protected
    expect([200, 301, 302, 401]).toContain(res.status());
  });

  test('@smoke Requirements Tracking UI is reachable', async ({ request }) => {
    const res = await request.get(`https://tracking.${DOMAIN}`);
    expect([200, 301, 302, 401]).toContain(res.status());
  });

  test('@smoke LiveKit server ingress is reachable', async ({ request }) => {
    const res = await request.get(`https://livekit.${DOMAIN}/`, { timeout: 10_000 });
    // LiveKit returns 404/426 on HTTP root — both confirm the ingress is alive
    expect([200, 404, 426]).toContain(res.status());
  });
});

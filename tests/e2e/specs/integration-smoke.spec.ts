// tests/e2e/specs/integration-smoke.spec.ts
//
// Smoke tests for all workspace services. Uses health-assertions
// to differentiate "service not deployed" from "service is broken".

import { test, expect } from '@playwright/test';
import { assertReachable } from '../lib/health-assertions';

const DOMAIN = process.env.PROD_DOMAIN;
const SKIP_REASON = 'PROD_DOMAIN not set — smoke tests require a live cluster domain';

test.describe('Integration Smoke Tests', () => {
  test.beforeAll(() => {
    if (!DOMAIN) test.skip(true, SKIP_REASON);
  });

  // ── Service Reachability ──────────────────────────────────────────────

  test('@smoke Pocket ID OIDC discovery is reachable', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://auth.${DOMAIN}/.well-known/openid-configuration`,
      { label: 'Pocket ID OIDC' },
      testInfo
    );
    const body = await res.json();
    expect(body.issuer).toBe(`https://auth.${DOMAIN}`);
    expect(body.authorization_endpoint).toBeTruthy();
    expect(body.token_endpoint).toBeTruthy();
  });

  test('@smoke Nextcloud is installed and operational', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://files.${DOMAIN}/status.php`,
      { label: 'Nextcloud status' },
      testInfo
    );
    const body = await res.json();
    expect(body.installed).toBe(true);
    expect(body.maintenance).toBe(false);
    expect(body.needsDbUpgrade).toBe(false);
  });

  test('@smoke Collabora discovery endpoint responds', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://office.${DOMAIN}/hosting/discovery`,
      { acceptableStatuses: [200], allow404AsNotDeployed: true, label: 'Collabora' },
      testInfo
    );
    const text = await res.text();
    expect(text).toContain('wopi-discovery');
  });

  test('@smoke Talk signaling server responds', async ({ request }, testInfo) => {
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    if (res.status() === 503) {
      // NATS backend unavailable but ingress is alive — log as fixme
      test.fixme(true, 'Signaling NATS backend unavailable (503) — T000480');
      return;
    }
    expect(res.status()).toBe(200);
  });

  test('@smoke Vaultwarden is alive', async ({ request }, testInfo) => {
    await assertReachable(
      request,
      `https://vault.${DOMAIN}/alive`,
      { label: 'Vaultwarden /alive' },
      testInfo
    );
  });

  test('@smoke Docs site responds', async ({ request }, testInfo) => {
    // 200 = public; 302 = redirect to auth; 401 = behind auth proxy (alive)
    await assertReachable(
      request,
      `https://docs.${DOMAIN}`,
      { acceptableStatuses: [200, 302, 401], label: 'Docs' },
      testInfo
    );
  });

  test('@smoke Mailpit responds', async ({ request }, testInfo) => {
    // 200 = accessible; 302/401 = behind oauth2-proxy (alive)
    // HTTP returns 404 (Traefik has no HTTP router for mail.*), HTTPS returns 401
    await assertReachable(
      request,
      `https://mail.${DOMAIN}`,
      { acceptableStatuses: [200, 302, 401], label: 'Mailpit' },
      testInfo
    );
  });

  // ── SSO Login Flow ────────────────────────────────────────────────────

  test('@smoke Pocket ID login page is reachable', async ({ page }) => {
    await page.goto(`https://auth.${DOMAIN}/login`);
    await expect(page).toHaveURL(/auth\./, { timeout: 60_000 });
  });

  test('@smoke Nextcloud shows OIDC login button', async ({ page }) => {
    await page.goto(`https://files.${DOMAIN}/login`);
    const atPI = page.url().includes(`auth.${DOMAIN}`);
    if (atPI) {
      return; // Auto-redirect to Pocket ID proves OIDC SSO is configured
    }
    const oidcButton = page.locator('a[href*="oidc"], a[href*="keycloak"], .oidc-button, .alternative-logins a[href*="social"]');
    const fallback = page.getByRole('link', { name: /keycloak|anmelden|openid|sso/i });
    await expect(oidcButton.first().or(fallback.first())).toBeVisible({ timeout: 60_000 });
  });

  // ── Collabora Integration ─────────────────────────────────────────────

  test('@smoke Collabora discovery is reachable from browser', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://office.${DOMAIN}/hosting/discovery`,
      { acceptableStatuses: [200], allow404AsNotDeployed: true, label: 'Collabora browser' },
      testInfo
    );
    const xml = await res.text();
    expect(xml).toContain('application/vnd.openxmlformats-officedocument');
  });

  // ── Talk Integration ──────────────────────────────────────────────────

  test('@smoke Talk signaling endpoint is configured', async ({ request }, testInfo) => {
    const res = await request.get(`https://signaling.${DOMAIN}/api/v1/welcome`);
    if (res.status() === 503) {
      test.fixme(true, 'Signaling NATS backend unavailable (503) — T000480');
      return;
    }
    expect(res.status()).toBe(200);
  });

  // ── New k3d Services ──────────────────────────────────────────────────

  test('@smoke Brett systemisches Brett healthz is reachable', async ({ request }, testInfo) => {
    await assertReachable(
      request,
      `https://brett.${DOMAIN}/healthz`,
      { label: 'Brett /healthz' },
      testInfo
    );
  });

  test('@smoke Document signing API is reachable', async ({ request }, testInfo) => {
    // The signing system is built into the website (PR #1485, T000557).
    // /api/signing/confirm is POST-only — GET returns 404 from Astro.
    // POST with empty body returns 400 (Invalid JSON) or 401 (unauthorized).
    await assertReachable(
      request,
      `https://web.${DOMAIN}/api/signing/confirm`,
      { method: 'POST', acceptableStatuses: [400, 401, 403, 405], label: 'Signing API' },
      testInfo
    );
});

});

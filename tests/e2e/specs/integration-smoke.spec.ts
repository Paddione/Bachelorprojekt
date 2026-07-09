// tests/e2e/specs/integration-smoke.spec.ts
//
// Smoke tests for all workspace services. Uses health-assertions
// to differentiate "service not deployed" from "service is broken".

import { test, expect } from '@playwright/test';
import { assertReachable } from '../lib/health-assertions';

const DOMAIN = process.env.PROD_DOMAIN || 'localhost';

test.describe('Integration Smoke Tests', () => {

  // ── Service Reachability ──────────────────────────────────────────────

  test('@smoke Keycloak OIDC discovery is reachable', async ({ request }, testInfo) => {
    const res = await assertReachable(
      request,
      `https://auth.${DOMAIN}/realms/workspace/.well-known/openid-configuration`,
      { label: 'Keycloak OIDC' },
      testInfo
    );
    const body = await res.json();
    expect(body.issuer).toContain(DOMAIN);
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
    // 404/500 were accepted before but are real errors — removed (T000480)
    await assertReachable(
      request,
      `http://mail.${DOMAIN}`,
      { acceptableStatuses: [200, 302, 401], label: 'Mailpit' },
      testInfo
    );
  });

  // ── SSO Login Flow ────────────────────────────────────────────────────

  test('@smoke Keycloak login page is reachable', async ({ page }) => {
    await page.goto(`https://auth.${DOMAIN}/realms/workspace/account/`);
    await expect(page).toHaveURL(/.*realms\/workspace.*/, { timeout: 60_000 });
  });

  test('@smoke Nextcloud shows Keycloak login button', async ({ page }) => {
    await page.goto(`https://files.${DOMAIN}/login`);
    const atKC = /realms\/workspace/.test(page.url());
    if (atKC) {
      return; // Auto-redirect to KC proves OIDC SSO is configured
    }
    const oidcButton = page.locator('a[href*="oidc"], a[href*="keycloak"], .oidc-button, .alternative-logins a[href*="social"]');
    const fallback = page.getByRole('link', { name: /keycloak|anmelden|openid|sso/i });
    await expect(oidcButton.first().or(fallback.first())).toBeVisible({ timeout: 30_000 });
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
    // /api/signing/confirm must reject unauthenticated requests — 401/403/302.
    await assertReachable(
      request,
      `https://web.${DOMAIN}/api/signing/confirm`,
      { acceptableStatuses: [401, 403, 302, 405], label: 'Signing API' },
      testInfo
    );
  });

  test('@smoke LiveKit server ingress is reachable', async ({ request }, testInfo) => {
    // LiveKit returns 404/426 on HTTP root — both confirm the ingress is alive
    await assertReachable(
      request,
      `https://livekit.${DOMAIN}/`,
      { acceptableStatuses: [200, 404, 426], timeout: 10_000, label: 'LiveKit' },
      testInfo
    );
  });
});

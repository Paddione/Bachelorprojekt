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



  test('@smoke Vaultwarden is alive', async ({ request }, testInfo) => {
    await assertReachable(
      request,
      `https://vault.${DOMAIN}/alive`,
      { label: 'Vaultwarden /alive', allow404AsNotDeployed: true },
      testInfo
    );
  });

  // NOTE [T900601]: no Docs smoke test — auto-docs was retired in #5961
  // (T900452, ADR-009); docs.${DOMAIN} intentionally 404s since 26.09.

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

// tests/e2e/specs/nfa-infra-health-sweep.spec.ts
//
// NFA-INFRA: Systematic HTTP health probes for all 17 workspace services.
// Uses the `request` fixture — no browser, no auth required.
// Set PROD_DOMAIN=mentolder.de to probe prod; omit for localhost fallback.
//
// Run: PROD_DOMAIN=mentolder.de npx playwright test nfa-infra-health-sweep.spec.ts --project=services

import { test, expect } from '@playwright/test';

const DOMAIN = process.env.PROD_DOMAIN;
const SKIP_WHEN_LOCAL = !DOMAIN;

function url(subdomain: string, path = '/'): string {
  if (!DOMAIN) return `http://localhost`;
  return `https://${subdomain}.${DOMAIN}${path}`;
}

const OPTIONS = {
  maxRedirects: 3,
  ignoreHTTPSErrors: true,
};

test.describe('NFA-INFRA: Service Health Sweep', () => {

  // ── Group 1: Core auth + website ────────────────────────────────────────
  test('website: root returns 200', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('web'), OPTIONS);
    expect(res.status()).toBe(200);
  });

  test('website: /api/health returns ok', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('web', '/api/health'), OPTIONS);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('ok', true);
  });

  test('keycloak: OIDC discovery returns 200 JSON', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(
      url('auth', '/realms/workspace/.well-known/openid-configuration'),
      OPTIONS,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('issuer');
    expect(body).toHaveProperty('authorization_endpoint');
  });

  // ── Group 2: Collaboration suite ────────────────────────────────────────
  test('nextcloud: /status.php returns installed:true', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('files', '/status.php'), OPTIONS);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.installed).toBe(true);
  });

  test('collabora: /hosting/discovery returns 200 XML', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('office', '/hosting/discovery'), OPTIONS);
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct).toMatch(/xml|text/);
  });

  test('vaultwarden: /alive returns 200', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('vault', '/alive'), OPTIONS);
    expect(res.status()).toBe(200);
  });

  test('docuseal: root reachable', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('sign'), OPTIONS);
    // 200 (logged in) or 302/200 redirect to login — just must not 5xx
    expect(res.status()).toBeLessThan(500);
  });

  // ── Group 3: Communication & docs ───────────────────────────────────────
  test('mailpit: root reachable (200 or auth redirect)', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('mail'), OPTIONS);
    expect(res.status()).toBeLessThan(500);
  });

  test('docs: root returns 200', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('docs'), OPTIONS);
    expect(res.status()).toBe(200);
  });

  // ── Group 4: Media + gaming ─────────────────────────────────────────────
  test('brett: root reachable (oauth2-proxy redirect)', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('brett'), OPTIONS);
    // oauth2-proxy returns 200 on the login page or redirects to Keycloak
    expect(res.status()).toBeLessThan(500);
  });

  test('arena: /healthz returns 200', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    // Arena runs on korczewski only; korczewski domain is configurable
    const korDomain = process.env.KORCZEWSKI_DOMAIN ?? 'korczewski.de';
    const res = await request.get(
      `https://arena-ws.${korDomain}/healthz`,
      OPTIONS,
    );
    expect(res.status()).toBe(200);
  });

  // ── Group 5: Website API health endpoints ───────────────────────────────
  test('website: /api/auth/login redirects to keycloak', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(
      url('web', '/api/auth/login?returnTo=/admin'),
      { ...OPTIONS, maxRedirects: 0 },
    );
    // Should redirect (302/303/307) to Keycloak
    expect([301, 302, 303, 307, 308]).toContain(res.status());
    const loc = res.headers()['location'] ?? '';
    expect(loc).toMatch(/realms\/workspace/);
  });

  test('website: /api/auth/me returns 200 with authenticated field', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('web', '/api/auth/me'), OPTIONS);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('authenticated');
  });

  // ── Group 6: Admin operations endpoints ─────────────────────────────────
  test('website: /admin/ops/health endpoint exists (401 or 200)', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('web', '/api/admin/ops/health'), OPTIONS);
    // 401 when unauthenticated is correct; 200 if session somehow exists
    expect([200, 401, 403]).toContain(res.status());
  });

  test('website: /api/admin/platform/software endpoint exists', async ({ request }) => {
    test.skip(SKIP_WHEN_LOCAL, 'requires PROD_DOMAIN');
    const res = await request.get(url('web', '/api/admin/platform/software'), OPTIONS);
    expect([200, 401, 403]).toContain(res.status());
  });
});

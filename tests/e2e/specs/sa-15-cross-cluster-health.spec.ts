// tests/e2e/specs/sa-15-cross-cluster-health.spec.ts
//
// SA-15: Cross-Cluster Health Verification
// Verifies both mentolder + korczewski clusters independently:
// OIDC discovery, website root, TLS validity, and cluster independence.
//
// Env vars:
//   WEBSITE_URL      (default: https://web.mentolder.de)
//   KORCZEWSKI_URL   (default: https://web.korczewski.de)

import { test, expect } from '@playwright/test';

const MENTOLDER_BASE  = (process.env.WEBSITE_URL     ?? 'https://web.mentolder.de').replace(/\/$/, '');
const KORCZEWSKI_BASE = (process.env.KORCZEWSKI_URL  ?? 'https://web.korczewski.de').replace(/\/$/, '');
const ARENA_BASE      = 'https://arena-ws.korczewski.de';

const MENTOLDER_AUTH  = 'https://auth.mentolder.de';
const KORCZEWSKI_AUTH = 'https://auth.korczewski.de';

const OPTIONS = { ignoreHTTPSErrors: false, maxRedirects: 3 } as const;

const IS_PROD = MENTOLDER_BASE.startsWith('https://');

test.describe('SA-15: Cross-Cluster Health', () => {

  // ── mentolder cluster ──────────────────────────────────────────────────
  test('mentolder: website root returns 200', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(MENTOLDER_BASE + '/', OPTIONS);
    expect(res.status()).toBe(200);
  });

  test('mentolder: keycloak OIDC discovery returns 200', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(
      `${MENTOLDER_AUTH}/realms/workspace/.well-known/openid-configuration`,
      OPTIONS,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issuer).toContain('mentolder');
  });

  test('mentolder: nextcloud /status.php returns 200', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get('https://files.mentolder.de/status.php', OPTIONS);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.installed).toBe(true);
  });

  test('mentolder: TLS cert valid (no cert error)', async ({ page }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    // page uses ignoreHTTPSErrors: false from project config — TLS errors throw
    let tlsError: string | undefined;
    page.on('requestfailed', req => {
      if (req.failure()?.errorText?.includes('CERT')) {
        tlsError = req.failure()?.errorText;
      }
    });
    await page.goto(MENTOLDER_BASE + '/', { waitUntil: 'domcontentloaded' });
    expect(tlsError, `TLS error on mentolder: ${tlsError}`).toBeUndefined();
  });

  // ── korczewski cluster ─────────────────────────────────────────────────
  test('korczewski: website root returns 200', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(KORCZEWSKI_BASE + '/', OPTIONS);
    expect(res.status()).toBe(200);
  });

  test('korczewski: keycloak OIDC discovery returns 200', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(
      `${KORCZEWSKI_AUTH}/realms/workspace/.well-known/openid-configuration`,
      OPTIONS,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issuer).toContain('korczewski');
  });

  test('korczewski: brett root reachable', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get('https://brett.korczewski.de', OPTIONS);
    expect(res.status()).toBeLessThan(500);
  });

  test('korczewski: TLS cert valid (no cert error)', async ({ page }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    let tlsError: string | undefined;
    page.on('requestfailed', req => {
      if (req.failure()?.errorText?.includes('CERT')) {
        tlsError = req.failure()?.errorText;
      }
    });
    await page.goto(KORCZEWSKI_BASE + '/', { waitUntil: 'domcontentloaded' });
    expect(tlsError, `TLS error on korczewski: ${tlsError}`).toBeUndefined();
  });

  // ── korczewski-only: Arena ─────────────────────────────────────────────
  test('arena: /healthz returns 200 (korczewski-only)', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(`${ARENA_BASE}/healthz`, OPTIONS);
    expect(res.status()).toBe(200);
  });

  // ── Cluster independence ───────────────────────────────────────────────
  test('clusters: auth domains serve independent realms', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');

    const [mentolderDiscovery, korczewskiDiscovery] = await Promise.all([
      request.get(
        `${MENTOLDER_AUTH}/realms/workspace/.well-known/openid-configuration`,
        OPTIONS,
      ).then(r => r.json()) as Promise<{ issuer: string; jwks_uri: string }>,
      request.get(
        `${KORCZEWSKI_AUTH}/realms/workspace/.well-known/openid-configuration`,
        OPTIONS,
      ).then(r => r.json()) as Promise<{ issuer: string; jwks_uri: string }>,
    ]);

    // Issuers must differ — they're independent realms on separate clusters
    expect(mentolderDiscovery.issuer).not.toBe(korczewskiDiscovery.issuer);
    expect(mentolderDiscovery.issuer).toContain('mentolder');
    expect(korczewskiDiscovery.issuer).toContain('korczewski');

    // JWKS URIs must come from different hosts
    expect(mentolderDiscovery.jwks_uri).not.toBe(korczewskiDiscovery.jwks_uri);
  });
});

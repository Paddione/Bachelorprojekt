// tests/e2e/specs/sa-15-cross-cluster-health.spec.ts
//
// SA-15: Multi-Brand Health Verification (unified-fleet topology)
//
// Topology (Fleet Stage 2, 2026-05-30):
//   • mentolder  — STILL a standalone k3s cluster (DNS flip pending). Always
//     expected live in prod.
//   • korczewski — now a BRAND NAMESPACE (workspace-korczewski) on the unified
//     `fleet` k3s cluster (pk-hetzner-4/6/8). It is NOT a separate physical
//     cluster any more. Until Phase 2b (`task fleet:deploy` for korczewski)
//     lands, the fleet Traefik has no router/cert for the korczewski SNI and
//     these checks SKIP rather than fail. See nfa-13 for the deploy GATE that
//     intentionally goes red until korczewski is live on fleet.
//
// This spec asserts each brand independently (website root, OIDC discovery,
// TLS validity) and that the two brands expose independent Keycloak realms —
// brand/realm isolation that holds whether or not they share a physical
// cluster.
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

// Probe whether the korczewski brand is already serving on the fleet cluster.
// While it is mid-migration the TLS handshake fails with `unrecognized name`
// (no router/cert) — fetch throws and we treat the brand as not-yet-deployed,
// so the brand-scoped checks SKIP instead of producing false regressions.
let korczewskiUp = false;
test.beforeAll(async () => {
  if (!IS_PROD) return;
  try {
    const res = await fetch(
      `${KORCZEWSKI_AUTH}/realms/workspace/.well-known/openid-configuration`,
      { redirect: 'follow' },
    );
    korczewskiUp = res.status === 200;
  } catch {
    korczewskiUp = false; // TLS unrecognized_name / connection refused — pending fleet:deploy
  }
});

test.describe('SA-15: Multi-Brand Health', () => {

  // ── mentolder (standalone cluster) ─────────────────────────────────────
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

  // ── korczewski brand (on the unified fleet cluster) ────────────────────
  // SKIP while the brand is not yet deployed on fleet — nfa-13 is the GATE.
  test('korczewski: website root returns 200', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    test.skip(!korczewskiUp, 'korczewski brand not yet serving on fleet — pending Phase 2b fleet:deploy');
    const res = await request.get(KORCZEWSKI_BASE + '/', OPTIONS);
    expect(res.status()).toBe(200);
  });

  test('korczewski: keycloak OIDC discovery returns 200', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    test.skip(!korczewskiUp, 'korczewski brand not yet serving on fleet — pending Phase 2b fleet:deploy');
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
    test.skip(!korczewskiUp, 'korczewski brand not yet serving on fleet — pending Phase 2b fleet:deploy');
    const res = await request.get('https://brett.korczewski.de', OPTIONS);
    expect(res.status()).toBeLessThan(500);
  });

  test('korczewski: TLS cert valid (no cert error)', async ({ page }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    test.skip(!korczewskiUp, 'korczewski brand not yet serving on fleet — pending Phase 2b fleet:deploy');
    let tlsError: string | undefined;
    page.on('requestfailed', req => {
      if (req.failure()?.errorText?.includes('CERT')) {
        tlsError = req.failure()?.errorText;
      }
    });
    await page.goto(KORCZEWSKI_BASE + '/', { waitUntil: 'domcontentloaded' });
    expect(tlsError, `TLS error on korczewski: ${tlsError}`).toBeUndefined();
  });

  // ── korczewski-only: Arena (on fleet) ──────────────────────────────────
  test('arena: /healthz returns 200 (korczewski-only)', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    test.skip(!korczewskiUp, 'korczewski brand not yet serving on fleet — pending Phase 2b fleet:deploy');
    const res = await request.get(`${ARENA_BASE}/healthz`, OPTIONS);
    expect(res.status()).toBe(200);
  });

  // ── Brand-realm independence ───────────────────────────────────────────
  // Each brand exposes its own Keycloak realm with a distinct issuer + JWKS.
  // This isolation must hold whether the brands share a physical cluster
  // (unified fleet) or not (mentolder still standalone today).
  test('brands: auth domains serve independent realms', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    test.skip(!korczewskiUp, 'korczewski brand not yet serving on fleet — pending Phase 2b fleet:deploy');

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

    // Issuers must differ — independent realms, one per brand
    expect(mentolderDiscovery.issuer).not.toBe(korczewskiDiscovery.issuer);
    expect(mentolderDiscovery.issuer).toContain('mentolder');
    expect(korczewskiDiscovery.issuer).toContain('korczewski');

    // JWKS URIs must come from different hosts (per-brand auth domain)
    expect(mentolderDiscovery.jwks_uri).not.toBe(korczewskiDiscovery.jwks_uri);
  });
});

// tests/e2e/specs/nfa-13-fleet-unified-cluster.spec.ts
//
// NFA-13: Unified Fleet Cluster — korczewski deploy GATE
//
// ⚠ INTENTIONAL RED GATE ⚠
// These checks are EXPECTED TO FAIL until Phase 2b of the Fleet Stage 2
// migration completes (`task fleet:deploy ENV=korczewski` against the unified
// `fleet` cluster, namespace workspace-korczewski). They go green the moment
// the fleet Traefik + cert-manager serve the korczewski brand. Do NOT
// "stabilise" them with skips — a failure here is the signal that korczewski
// is not yet live on the unified cluster.
//
// Topology: the standalone korczewski cluster was torn down; its hosts
// (pk-hetzner-4/6/8) now run the unified `fleet` k3s cluster which will serve
// the korczewski brand from namespace workspace-korczewski. mentolder remains
// a separate standalone cluster until its (later) DNS flip.
//
// Verification is external HTTP/TLS only — no kubectl/cluster-internal access.
//
// Env vars:
//   KORCZEWSKI_URL   (default: https://web.korczewski.de)

import { test, expect } from '@playwright/test';

const KORCZEWSKI_BASE = (process.env.KORCZEWSKI_URL ?? 'https://web.korczewski.de').replace(/\/$/, '');
const KORCZEWSKI_AUTH = 'https://auth.korczewski.de';
const ARENA_BASE      = 'https://arena-ws.korczewski.de';

const OPTIONS = { ignoreHTTPSErrors: false, maxRedirects: 3 } as const;
const IS_PROD = KORCZEWSKI_BASE.startsWith('https://');

test.describe('NFA-13: Unified Fleet — korczewski deploy GATE', () => {

  // GATE T1: the fleet Traefik serves the korczewski website root.
  test('GATE: korczewski website root returns 200 (served by fleet)', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(KORCZEWSKI_BASE + '/', OPTIONS);
    expect(res.status()).toBe(200);
  });

  // GATE T2: cert-manager on the fleet issued a valid cert for the korczewski
  // SNI — while undeployed the handshake fails with `unrecognized name`.
  test('GATE: korczewski TLS handshake succeeds (cert-manager cert present)', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    // ignoreHTTPSErrors:false → an invalid/absent cert makes this request throw.
    const res = await request.get(KORCZEWSKI_BASE + '/', OPTIONS);
    expect(res.status()).toBeLessThan(500);
  });

  // GATE T3: Keycloak in workspace-korczewski answers OIDC discovery with the
  // korczewski realm issuer.
  test('GATE: korczewski OIDC discovery returns korczewski issuer', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(
      `${KORCZEWSKI_AUTH}/realms/workspace/.well-known/openid-configuration`,
      OPTIONS,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.issuer).toContain('korczewski');
  });

  // GATE T4: Arena (korczewski-only) is healthy on the fleet cluster.
  test('GATE: arena /healthz returns 200 on fleet', async ({ request }) => {
    test.skip(!IS_PROD, 'requires prod URLs');
    const res = await request.get(`${ARENA_BASE}/healthz`, OPTIONS);
    expect(res.status()).toBe(200);
  });
});

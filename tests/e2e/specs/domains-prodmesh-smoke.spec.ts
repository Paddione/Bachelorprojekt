import { test, expect } from '@playwright/test';

// domains-prodmesh-smoke (Goal devmesh-prodmesh-naming, K5 — p2p3-Plan p3):
// je ein Dev- (devmesh) und Prod-Host (prodmesh) mit DNS, TLS und erwartetem
// Status. Ehrlichkeitsklausel: Live-Grün für prodmesh ist ohne
// Nachfolger-Cluster unmöglich (Fleet DECOMMISSIONED 2026-10-22, prodmesh
// frozen per D1). Deshalb ist diese Spec file-fertig und skippt begründet,
// bis PRODMESH_LIVE=1 (Eigner-Freigabe + Deploy) bzw. DEVMESH_LIVE=1 gesetzt
// ist. Tag @mesh (nicht @smoke): läuft nicht in PR-Runs.
const PRODMESH_LIVE = process.env.PRODMESH_LIVE === '1';
const DEVMESH_LIVE = process.env.DEVMESH_LIVE === '1';

const PROD_HOSTS = [
  'https://web.korczewski.de/',
  'https://korczewski.de/',
  'https://auth.korczewski.de/',
];

test.describe('prodmesh: kanonische Prod-Hosts (DNS+TLS+Routing)', { tag: ['@mesh'] }, () => {
  test.skip(
    !PRODMESH_LIVE,
    'PRODMESH_LIVE nicht gesetzt — kein Nachfolger-Cluster (Fleet DECOMMISSIONED), prodmesh frozen per D1',
  );
  for (const url of PROD_HOSTS) {
    test(`${url} antwortet (kein 5xx, kein Timeout)`, async ({ request }) => {
      test.setTimeout(30_000);
      const res = await request.get(url, { ignoreHTTPSErrors: false });
      expect(res.status(), `${url} HTTP-Status`).toBeLessThan(500);
    });
  }
});

test.describe('devmesh: kanonische Dev-Hosts (DNS+TLS+Status)', { tag: ['@mesh'] }, () => {
  test.skip(!DEVMESH_LIVE, 'DEVMESH_LIVE nicht gesetzt — kein Tailnet-Zugang zum devmesh-Cluster');
  test('agent-board 302 auf /api/auth/login', async ({ request }) => {
    const res = await request.get('https://agent-board.devmesh.korczewski.de/', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()['location'] ?? '').toContain('/api/auth/login');
  });
  test('pocket-id 200', async ({ request }) => {
    const res = await request.get('https://auth.devmesh.korczewski.de/');
    expect(res.status()).toBe(200);
  });
});

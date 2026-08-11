import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// Topology note (unified-fleet, Fleet Stage 2): each website instance probes
// ONLY its own cluster's services — mentolder (standalone) reports cluster key
// 'mentolder'; the korczewski brand (namespace workspace-korczewski on the
// unified `fleet` cluster) reports 'korczewski'. The single-cluster assertion
// in T3 holds for both — there is deliberately no cross-cluster fan-out.
test.describe('FA-44: Platform Hub — Software Assets & System-Integrität', { tag: ['@admin', '@smoke'] }, () => {
  // Routen seit dem SDLC-Build-Target-Split (T002624) unter /sdlc/api/*:
  // die alten /api/admin/platform/* und /api/admin/ops/* existieren nicht mehr.
  test('T1: /sdlc/api/platform/software requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/sdlc/api/platform/software`);
    expect([401, 403]).toContain(res.status());
  });

  test('T2: /sdlc/api/ops/health requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/sdlc/api/ops/health`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: health API returns only current cluster (no cross-cluster probe)', async ({ page }, testInfo) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { test.fixme(true, 'CRON_SECRET not set'); return; }

    await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent('paddione')}&token=${encodeURIComponent(cronSecret)}&returnTo=%2Fadmin`);
    const res = await page.request.get(`${BASE}/sdlc/api/ops/health`);
    if (res.status() === 401) test.fixme(true, 'Not authenticated');
    if (res.status() !== 200) return;

    const body = await res.json();
    expect(body).toHaveProperty('results');
    expect(body).toHaveProperty('checkedAt');

    const clusterKeys = Object.keys(body.results);
    expect(clusterKeys).toHaveLength(1);
    expect(['mentolder', 'korczewski']).toContain(clusterKeys[0]);

    const results: any[] = body.results[clusterKeys[0]];
    expect(results.length).toBeGreaterThan(0);
    for (const svc of results) {
      expect(svc).toHaveProperty('name');
      expect(svc).toHaveProperty('status');
      expect(['ok', 'slow', 'error', 'optional']).toContain(svc.status);
      expect(svc).toHaveProperty('slug');
    }
  });

  test('T4: software assets API returns collabora with workspace-office namespace', async ({ page }, testInfo) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { test.fixme(true, 'CRON_SECRET not set'); return; }

    await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent('paddione')}&token=${encodeURIComponent(cronSecret)}&returnTo=%2Fadmin`);
    const res = await page.request.get(`${BASE}/sdlc/api/platform/software`);
    if (res.status() === 401) test.fixme(true, 'Not authenticated');
    if (res.status() !== 200) return;

    const body = await res.json();
    const collabora = (body.assets as any[]).find((a: any) => a.slug === 'collabora');
    expect(collabora).toBeDefined();
    expect(collabora.namespace).toBe('workspace-office');
    expect(collabora.live_status).not.toBe('missing');
  });

  test('T5: health API reports Collabora reachable (not error)', async ({ page }, testInfo) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { test.fixme(true, 'CRON_SECRET not set'); return; }

    await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent('paddione')}&token=${encodeURIComponent(cronSecret)}&returnTo=%2Fadmin`);
    const res = await page.request.get(`${BASE}/sdlc/api/ops/health`);
    if (res.status() === 401) test.fixme(true, 'Not authenticated');
    if (res.status() !== 200) return;

    const body = await res.json();
    const clusterKey = Object.keys(body.results)[0];
    const collabora = (body.results[clusterKey] as any[]).find((s: any) => s.name === 'Collabora');
    expect(collabora).toBeDefined();
    // Lokaler Dev-Server (Host) kann den Cluster-internen Service-DNS
    // (collabora.workspace-office.svc.cluster.local) nicht auflösen — der
    // Probe meldet dann zu Recht 'error'. Auf prod/in-cluster ist Collabora
    // ok/slow. Kein App-Defekt, sondern Laufzeit-Umgebung (T002624-Split:
    // die SDLC-Console läuft im Cluster, nicht auf dem Host).
    if (collabora.status === 'error' && /localhost|127\.0\.0\.1/.test(BASE)) {
      test.fixme(true, `Collabora-Status 'error' auf lokalem Host (Cluster-DNS nicht auflösbar): ${collabora.url}`);
      return;
    }
    expect(['ok', 'slow']).toContain(collabora.status);
  });

  test('T6: health API now probes more than the 5 hardcoded services', async ({ page }, testInfo) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { test.fixme(true, 'CRON_SECRET not set'); return; }

    await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent('paddione')}&token=${encodeURIComponent(cronSecret)}&returnTo=%2Fadmin`);
    const res = await page.request.get(`${BASE}/sdlc/api/ops/health`);
    if (res.status() === 401) test.fixme(true, 'Not authenticated');
    if (res.status() !== 200) return;

    const body = await res.json();
    const clusterKey = Object.keys(body.results)[0];
    const results: any[] = body.results[clusterKey];
    expect(results.length).toBeGreaterThan(5);
    for (const svc of results) {
      expect(svc).toHaveProperty('slug');
      expect(typeof svc.optional).toBe('boolean');
    }
  });
});

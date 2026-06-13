import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// Topology note (unified-fleet, Fleet Stage 2): each website instance probes
// ONLY its own cluster's services — mentolder (standalone) reports cluster key
// 'mentolder'; the korczewski brand (namespace workspace-korczewski on the
// unified `fleet` cluster) reports 'korczewski'. The single-cluster assertion
// in T3 holds for both — there is deliberately no cross-cluster fan-out.
test.describe('FA-44: Platform Hub — Software Assets & System-Integrität', { tag: ['@admin', '@smoke'] }, () => {
  test('T1: /api/admin/platform/software requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/software`);
    expect([401, 403]).toContain(res.status());
  });

  test('T2: /api/admin/ops/health requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/ops/health`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: health API returns only current cluster (no cross-cluster probe)', async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/api/admin/ops/health`,
      { acceptableStatuses: [200, 302, 401, 403], label: 'ops health API' },
      testInfo
    );

    const loginRes = await request.post(`${BASE}/api/auth/login`, {
      data: { username: 'paddione', password: process.env.E2E_ADMIN_PASS }
    });
    // If the endpoint doesn't exist, rely on cookie auth from global setup
    const res = await request.get(`${BASE}/api/admin/ops/health`);
    if (res.status() === 401) test.skip(true, 'Not authenticated — skip');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('results');
    expect(body).toHaveProperty('checkedAt');

    // Must return exactly one cluster key matching the site's own cluster
    const clusterKeys = Object.keys(body.results);
    expect(clusterKeys).toHaveLength(1);
    // The single key must be a known cluster name (not both)
    expect(['mentolder', 'korczewski']).toContain(clusterKeys[0]);

    // Each result entry must have name, status, latencyMs fields
    const results: any[] = body.results[clusterKeys[0]];
    expect(results.length).toBeGreaterThan(0);
    for (const svc of results) {
      expect(svc).toHaveProperty('name');
      expect(svc).toHaveProperty('status');
      expect(['ok', 'slow', 'error', 'optional']).toContain(svc.status);
      expect(svc).toHaveProperty('slug');
    }
  });

  test('T4: software assets API returns collabora with workspace-office namespace', async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/api/admin/platform/software`,
      { acceptableStatuses: [200, 302, 401, 403], label: 'platform software API' },
      testInfo
    );

    const res = await request.get(`${BASE}/api/admin/platform/software`);
    if (res.status() === 401) test.skip(true, 'Not authenticated — skip');

    expect(res.status()).toBe(200);
    const body = await res.json();
    const collabora = (body.assets as any[]).find((a: any) => a.slug === 'collabora');
    expect(collabora).toBeDefined();
    expect(collabora.namespace).toBe('workspace-office');
    // live_status must not be 'missing' — the deployment exists in workspace-office
    expect(collabora.live_status).not.toBe('missing');
  });

  test('T5: health API reports Collabora reachable (not error)', async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/api/admin/ops/health`,
      { acceptableStatuses: [200, 302, 401, 403], label: 'ops health API' },
      testInfo
    );

    const res = await request.get(`${BASE}/api/admin/ops/health`);
    if (res.status() === 401) test.skip(true, 'Not authenticated — skip');

    expect(res.status()).toBe(200);
    const body = await res.json();
    const clusterKey = Object.keys(body.results)[0];
    const collabora = (body.results[clusterKey] as any[]).find((s: any) => s.name === 'Collabora');
    expect(collabora).toBeDefined();
    // The website pod must be able to reach collabora.workspace-office:9980.
    expect(['ok', 'slow']).toContain(collabora.status);
  });

  test('T6: health API now probes more than the 5 hardcoded services', async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/api/admin/ops/health`,
      { acceptableStatuses: [200, 302, 401, 403], label: 'ops health API' },
      testInfo
    );
    const res = await request.get(`${BASE}/api/admin/ops/health`);
    if (res.status() === 401) test.skip(true, 'Not authenticated — skip');
    expect(res.status()).toBe(200);
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

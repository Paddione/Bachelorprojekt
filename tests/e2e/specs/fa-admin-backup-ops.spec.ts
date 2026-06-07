import { test, expect } from '@playwright/test';

// FA: Admin Backup Ops — smoke assertions for /api/admin/ops/backup endpoints.
// These endpoints handle sensitive backup operations and must never be
// accessible without authentication or accept invalid cluster targets.

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin Backup Ops — auth + input guards', () => {

  test('T1: GET /api/admin/ops/backup/list returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/ops/backup/list`);
    expect(
      res.status(),
      'list endpoint must not return 200 without auth — backup job history exposed!'
    ).not.toBe(200);
    expect(
      res.status(),
      'list endpoint must not return 500 — server error on unauthenticated request'
    ).not.toBe(500);
    expect([401, 403, 302]).toContain(res.status());
  });

  test('T2: POST /api/admin/ops/backup/trigger returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/ops/backup/trigger`, {
      data: { cluster: 'mentolder' },
    });
    expect(
      res.status(),
      'trigger endpoint must not return 200 without auth — backup job creation exposed!'
    ).not.toBe(200);
    expect(
      res.status(),
      'trigger endpoint must not return 500 on unauthenticated request'
    ).not.toBe(500);
    expect([401, 403, 302]).toContain(res.status());
  });

  test('T3: GET /api/admin/ops/backup/list with invalid cluster rejects without leaking info', async ({ request }) => {
    // Even an invalid cluster should not expose data — either auth-first (401/403)
    // or reject the bad input (400). Never 200 or 500.
    const res = await request.get(`${BASE}/api/admin/ops/backup/list?cluster=INVALID_CLUSTER`);
    expect(res.status()).not.toBe(200);
    expect(res.status()).not.toBe(500);
  });

  test('T4: POST /api/admin/ops/backup/trigger with invalid cluster body rejects safely', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/ops/backup/trigger`, {
      data: { cluster: 'INVALID_CLUSTER' },
    });
    expect(res.status()).not.toBe(200);
    expect(res.status()).not.toBe(500);
  });

  test('T5: POST /api/admin/ops/backup/trigger with empty body does not trigger a backup', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/ops/backup/trigger`, {
      data: {},
    });
    // Must not produce a 200 with an empty or null cluster — would create a corrupt backup job.
    expect(res.status()).not.toBe(200);
    expect(res.status()).not.toBe(500);
  });

});

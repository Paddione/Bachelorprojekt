import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-20: Meeting Finalization Pipeline', { tag: ['@meeting'] }, () => {
  // F4: /api/meeting/finalize is internal-only (talk-transcriber with
  // INTERNAL_API_TOKEN). The CI/dev server reads the same secret from env.
  const internalHeaders = () =>
    process.env.INTERNAL_API_TOKEN
      ? { 'x-internal-token': process.env.INTERNAL_API_TOKEN }
      : {};

  test('T1: POST /api/meeting/finalize without token returns 401', async ({ request }) => {
    const res = await request.post(`${BASE}/api/meeting/finalize`, {
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test('T2: POST /api/meeting/finalize with valid data returns success', async ({ request }) => {
    // Skip on korczewski: finalize returns 500 due to DB/config mismatch on that cluster.
    // The mentolder cluster has the full meetings schema; korczewski does not.
    const prodDomain = process.env.PROD_DOMAIN;
    test.skip(
      !!prodDomain && prodDomain !== 'mentolder.de',
      'finalize 500 on korczewski — meetings schema not provisioned on this cluster'
    );
    // Internal-only route (F4): needs the shared secret, like CRON_SECRET
    // for the purge bracket. Skip the authed path when it is not exported.
    test.skip(
      !process.env.INTERNAL_API_TOKEN,
      'INTERNAL_API_TOKEN not exported — authed finalize path not exercised'
    );
    // '[TEST]'-prefixed meeting_type + reserved .invalid mail: the purge
    // bracket's meetings sweep (meeting_type LIKE '[TEST]%') reaps the row,
    // which unblocks the customer allowlist sweep for the upserted customer.
    // The previous fixture ('Test Kunde' with a real-looking example.de
    // address and plain 'Erstgesprach') accumulated 309 unmarked finalized
    // meetings in prod that no sweep could touch (T001456).
    const res = await request.post(`${BASE}/api/meeting/finalize`, {
      headers: internalHeaders(),
      data: {
        customerName: '[TEST] E2E Kunde',
        customerEmail: 'test-e2e@example.invalid',
        meetingType: '[TEST] Erstgesprach',
        meetingDate: '03.04.2026',
      },
    });
    await expect(res).toBeOK();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });
});

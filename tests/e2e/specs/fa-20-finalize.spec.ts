import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-20: Meeting Finalization Pipeline', () => {
  test('T1: POST /api/meeting/finalize without data returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/meeting/finalize`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('T2: POST /api/meeting/finalize with valid data returns success', async ({ request }) => {
    // Skip on korczewski: finalize returns 500 due to DB/config mismatch on that cluster.
    // The mentolder cluster has the full meetings schema; korczewski does not.
    const prodDomain = process.env.PROD_DOMAIN;
    test.skip(
      !!prodDomain && prodDomain !== 'mentolder.de',
      'finalize 500 on korczewski — meetings schema not provisioned on this cluster'
    );
    // '[TEST]'-prefixed meeting_type + reserved .invalid mail: the purge
    // bracket's meetings sweep (meeting_type LIKE '[TEST]%') reaps the row,
    // which unblocks the customer allowlist sweep for the upserted customer.
    // The previous fixture ('Test Kunde' with a real-looking example.de
    // address and plain 'Erstgesprach') accumulated 309 unmarked finalized
    // meetings in prod that no sweep could touch (T001456).
    const res = await request.post(`${BASE}/api/meeting/finalize`, {
      data: {
        customerName: '[TEST] E2E Kunde',
        customerEmail: 'test-e2e@example.invalid',
        meetingType: '[TEST] Erstgesprach',
        meetingDate: '03.04.2026',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });
});

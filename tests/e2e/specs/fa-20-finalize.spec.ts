import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';
// F4: interne Routen brauchen den Shared Secret als Bearer-Token. Ohne Token
// im Env kein Gate-Test moeglich (pre-Gate waere es 400/200, post-Gate 401) —
const MEETING_TOKEN = process.env.MEETING_INTERNAL_TOKEN || '';
const authHeaders = () =>
  MEETING_TOKEN ? { Authorization: `Bearer ${MEETING_TOKEN}` } : {};

test.describe('FA-20: Meeting Finalization Pipeline', { tag: ['@meeting'] }, () => {
  test('T1: POST /api/meeting/finalize without data returns 400', async ({ request }) => {
    test.skip(!MEETING_TOKEN, 'MEETING_INTERNAL_TOKEN not set — gate behavior covered by unit tests');
    const res = await request.post(`${BASE}/api/meeting/finalize`, {
      headers: authHeaders(),
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
    test.skip(!MEETING_TOKEN, 'MEETING_INTERNAL_TOKEN not set — gate behavior covered by unit tests');
    const res = await request.post(`${BASE}/api/meeting/finalize`, {
      headers: authHeaders(),
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

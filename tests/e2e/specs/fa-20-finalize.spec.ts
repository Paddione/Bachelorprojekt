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
    const res = await request.post(`${BASE}/api/meeting/finalize`, {
      data: {
        customerName: 'Test Kunde',
        customerEmail: 'test@example.de',
        meetingType: 'Erstgesprach',
        meetingDate: '03.04.2026',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });
});

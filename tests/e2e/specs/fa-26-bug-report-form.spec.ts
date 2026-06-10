import { test, expect } from '@playwright/test';

const BASE        = process.env.WEBSITE_URL || 'http://localhost:4321';
const CRON_SECRET = process.env.CRON_SECRET;

// The bug report widget is rendered inside AdminLayout (admin-only UI).
// These tests exercise the public /api/bug-report endpoint directly.

test.describe('FA-26: Bug report API', () => {
  test('POST /api/bug-report without description returns 400', async ({ request }) => {
    const form = new FormData();
    form.append('email', 'test@example.de');
    form.append('category', 'fehler');
    const res = await request.post(`${BASE}/api/bug-report`, { multipart: { email: 'test@example.de', category: 'fehler' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /api/bug-report with invalid email returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/bug-report`, {
      multipart: { description: 'Test bug', email: 'not-an-email', category: 'fehler' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /api/bug-report with invalid category returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/bug-report`, {
      multipart: { description: 'Test bug', email: 'test@example.de', category: 'ungueltig' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('POST /api/bug-report with valid data returns 200 with ticketId', async ({ request }) => {
    // X-E2E-Test + X-Cron-Secret stamps is_test_data=true so the purge bracket
    // cleans up the created ticket and inbox item. Without these headers the row
    // accumulates in the admin inbox on every E2E run.
    const headers: Record<string, string> = {};
    if (CRON_SECRET) {
      headers['X-E2E-Test'] = '1';
      headers['X-Cron-Secret'] = CRON_SECRET;
    }
    const res = await request.post(`${BASE}/api/bug-report`, {
      headers,
      multipart: {
        description: 'Automatischer E2E-Test: Seite lädt nicht korrekt.',
        email: 'e2e-test@example.invalid',
        category: 'fehler',
        url: `${BASE}/`,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.ticketId).toMatch(/^T\d+$/);
  });

  test('POST /api/bug-report with description too long returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/bug-report`, {
      multipart: {
        description: 'x'.repeat(2001),
        email: 'test@example.de',
        category: 'fehler',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/status with valid ticket format — API responds correctly', async ({ request }) => {
    // Verify the ticket status API works (uses T-format IDs)
    const res = await request.get(`${BASE}/api/status?id=T000001`);
    expect([200, 404]).toContain(res.status());
    const body = await res.json();
    expect(typeof body).toBe('object');
  });
});

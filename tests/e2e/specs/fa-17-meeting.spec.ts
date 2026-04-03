import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-17: Meeting Lifecycle', () => {
  test('T1: Reminders process endpoint works', async ({ request }) => {
    const res = await request.post(`${BASE}/api/reminders/process`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('sent');
    expect(body).toHaveProperty('pending');
    expect(typeof body.sent).toBe('number');
    expect(typeof body.pending).toBe('number');
  });

  test('T2: Reminders GET shows pending list', async ({ request }) => {
    const res = await request.get(`${BASE}/api/reminders/process`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('pending');
    expect(body).toHaveProperty('reminders');
    expect(Array.isArray(body.reminders)).toBe(true);
  });
});

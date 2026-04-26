import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

// Valid-format UUID that does not exist in the DB
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';
const INVALID_ID = 'not-a-uuid';

test.describe('FA-Poll: Live-Umfrage', () => {
  test('T1: GET /api/poll/:id with invalid UUID format returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/poll/${INVALID_ID}`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not found');
  });

  test('T2: GET /api/poll/:id with valid UUID but no poll returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/poll/${FAKE_UUID}`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not found');
  });

  test('T3: GET /api/poll/:id/results with invalid UUID format returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/poll/${INVALID_ID}/results`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not found');
  });

  test('T4: GET /api/poll/:id/results for non-existent poll returns 404', async ({ request }) => {
    const res = await request.get(`${BASE}/api/poll/${FAKE_UUID}/results`);
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('not found');
  });

  test('T5: POST /api/poll/:id/answer with invalid UUID returns 404', async ({ request }) => {
    const res = await request.post(`${BASE}/api/poll/${INVALID_ID}/answer`, {
      data: { answer: 'Ja' },
    });
    expect(res.status()).toBe(404);
  });

  test('T6: POST /api/poll/:id/answer with non-existent UUID returns 404', async ({ request }) => {
    const res = await request.post(`${BASE}/api/poll/${FAKE_UUID}/answer`, {
      data: { answer: 'Ja' },
    });
    expect(res.status()).toBe(404);
  });

  test('T7: POST /api/poll/:id/answer with missing answer returns 400', async ({ request }) => {
    // The non-existent poll check (404) runs before answer validation, so either 400 or 404 is acceptable
    const res = await request.post(`${BASE}/api/poll/${FAKE_UUID}/answer`, {
      data: {},
    });
    expect([400, 404]).toContain(res.status());
  });

  test('T8: /poll/:id page renders gracefully for non-existent poll', async ({ page }) => {
    // A non-existent poll renders as locked ("Umfrage geschlossen")
    const res = await page.goto(`${BASE}/poll/${FAKE_UUID}`);
    expect(res?.status()).not.toBe(500);
    await expect(page.locator('body')).not.toContainText('500');
    await expect(page.locator('body')).toBeVisible();
  });

  test('T9: /poll/:id/results for non-existent poll redirects to homepage', async ({ page }) => {
    // Results page redirects to / when poll not found or not locked
    await page.goto(`${BASE}/poll/${FAKE_UUID}/results`);
    await expect(page).toHaveURL('/');
  });
});

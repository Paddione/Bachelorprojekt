import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-16: Calendar Booking', () => {
  test('T1: /api/calendar/slots returns JSON array', async ({ request }) => {
    const res = await request.get(`${BASE}/api/calendar/slots`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('T2: Slots have correct structure', async ({ request }) => {
    const res = await request.get(`${BASE}/api/calendar/slots`);
    const body = await res.json();
    if (body.length > 0) {
      const day = body[0];
      expect(day).toHaveProperty('date');
      expect(day).toHaveProperty('weekday');
      expect(day).toHaveProperty('slots');
      expect(Array.isArray(day.slots)).toBe(true);
      if (day.slots.length > 0) {
        expect(day.slots[0]).toHaveProperty('start');
        expect(day.slots[0]).toHaveProperty('end');
        expect(day.slots[0]).toHaveProperty('display');
      }
    }
  });

  test('T3: Slots only on working days (Mon-Fri)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/calendar/slots`);
    const body = await res.json();
    const weekendDays = ['Samstag', 'Sonntag'];
    for (const day of body) {
      expect(weekendDays).not.toContain(day.weekday);
    }
  });

  test('T4: /termin page loads with booking form', async ({ page }) => {
    await page.goto(`${BASE}/termin`);
    await expect(page.locator('h1')).toContainText('Termin');
    // Should show booking type selection
    await expect(page.locator('text=Art des Termins')).toBeVisible();
  });

  test('T5: POST /api/booking without data returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/booking`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('T6: POST /api/booking with non-whitelisted slot returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/booking`, {
      data: {
        name: 'Test User',
        email: 'test@example.de',
        phone: '',
        type: 'erstgespraech',
        message: '',
        slotStart: '2026-04-10T07:00:00.000Z',
        slotEnd: '2026-04-10T08:00:00.000Z',
        slotDisplay: '09:00 - 10:00',
        date: '2026-04-10',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('nicht mehr verfügbar');
  });
});

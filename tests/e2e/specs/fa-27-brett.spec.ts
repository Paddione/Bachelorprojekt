import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

test.describe('FA-27: Systemisches Brett', () => {
  test('T1: Brett service is reachable', async ({ request }) => {
    const res = await request.get(BRETT_URL);
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T2: /healthz returns 200', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/healthz`);
    expect(res.status()).toBe(200);
  });

  test('T3: /api/state returns JSON figures array for unknown room', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/api/state?room=e2e-probe-${Date.now()}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('figures');
    expect(Array.isArray(body.figures)).toBe(true);
  });

  test('T4: /three.min.js static asset is served', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/three.min.js`);
    expect(res.status()).toBe(200);
  });

  test('T5: POST /api/snapshots creates a snapshot', async ({ request }) => {
    const room = `e2e-snap-${Date.now()}`;
    const res = await request.post(`${BRETT_URL}/api/snapshots`, {
      data: { room, name: 'e2e-test-snapshot', figures: [] },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty('id');
  });
});

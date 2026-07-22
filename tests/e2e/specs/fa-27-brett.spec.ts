import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

test.describe('FA-27: Systemisches Brett', { tag: ['@brett'] }, () => {
  // ── Unauthenticated probes (services project) ───────────────────────────
  test('T1: Brett service is reachable', async ({ request }) => {
    const res = await request.get(BRETT_URL);
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T2: /healthz returns 200', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/healthz`);
    expect(res.status()).toBe(200);
  });

  test('T4: /three.min.js static asset is served', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/three.min.js`);
    expect(res.status()).toBe(200);
  });

  // ── Authenticated data API tests (brett-mentolder project) ──────────────
  // These require storageState from .auth/mentolder-brett.json.
  // When run in the services project (no storageState), they are skipped.
  test.describe('data API tests (authenticated)', () => {
    test.skip(
      !process.env.PLAYWRIGHT_PROJECT?.includes('brett-mentolder'),
      'requires brett-mentolder storageState',
    );

    test('T3: /api/state returns JSON figures array for unknown room', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/state?room=e2e-probe-${Date.now()}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('figures');
      expect(Array.isArray(body.figures)).toBe(true);
    });

    test('T5: POST /api/snapshots creates a snapshot (current schema)', async ({ request }) => {
      const room_token = `e2e-snap-${Date.now()}`;
      const res = await request.post(`${BRETT_URL}/api/snapshots`, {
        data: { room_token, name: 'e2e-test-snapshot', state: { figures: [] } },
      });
      expect([200, 201]).toContain(res.status());
      const body = await res.json();
      expect(body).toHaveProperty('id');
    });

    test('T6: GET /api/snapshots without params returns 400', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/snapshots`);
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });

    test('T7: GET /api/snapshots with room param returns array', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/snapshots?room=e2e-snap-list-${Date.now()}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('T8: GET /api/snapshots/:id returns 404 for unknown UUID', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/snapshots/00000000-0000-0000-0000-000000000000`);
      expect(res.status()).toBe(404);
    });

    test('T9: POST /api/snapshots validates missing state.figures', async ({ request }) => {
      const res = await request.post(`${BRETT_URL}/api/snapshots`, {
        data: { name: 'bad-payload' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/state\.figures/i);
    });

    test('T10: GET /api/customers returns array', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/customers`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('T11: GET /presets returns array', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/presets`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('T12: POST /presets creates preset and DELETE removes it', async ({ request }) => {
      const createRes = await request.post(`${BRETT_URL}/presets`, {
        data: { name: 'e2e-preset', appearance: { face: undefined, accessories: [] } },
      });
      expect(createRes.status()).toBe(201);
      const preset = await createRes.json();
      expect(preset).toHaveProperty('id');
      expect(preset.name).toBe('e2e-preset');

      const delRes = await request.delete(`${BRETT_URL}/presets/${preset.id}`);
      expect(delRes.status()).toBe(204);

      const delAgain = await request.delete(`${BRETT_URL}/presets/${preset.id}`);
      expect(delAgain.status()).toBe(404);
    });

    test('T13: POST /presets validates name length', async ({ request }) => {
      const res = await request.post(`${BRETT_URL}/presets`, {
        data: { name: 'x'.repeat(101), appearance: {} },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty('error');
    });
  });
});

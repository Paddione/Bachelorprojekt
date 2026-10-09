import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const base = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const defaultBrett = base.includes('mentolder.de')
  ? 'https://brett.mentolder.de'
  : base.includes('korczewski.de')
  ? 'https://brett.korczewski.de'
  : 'http://brett.localhost';

const BRETT_URL = process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : defaultBrett);

const BRETT_AUTH_STATE = path.join(__dirname, '..', '.auth', 'mentolder-brett.json');

function hasAuthState(): boolean {
  if (!fs.existsSync(BRETT_AUTH_STATE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(BRETT_AUTH_STATE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch { return false; }
}

test.describe('FA-27: Systemisches Brett', { tag: ['@brett'] }, () => {
  // ── Unauthenticated probes (services project) ───────────────────────────
  test('T1: Brett service is reachable', async ({ request }) => {
    const res = await request.get(BRETT_URL, { maxRedirects: 0 });
    expect([200, 301, 302]).toContain(res.status());
  });

  test('T2: /healthz returns 200', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/healthz`, { maxRedirects: 0 });
    expect([200, 302]).toContain(res.status());
  });

  test('T4: static asset is served', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/share.html`, { maxRedirects: 0 });
    expect([200, 302]).toContain(res.status());
  });

  // ── T901676-Audit: anonyme API-Proben (services-projekttauglich) ──────────
  // 302 = oauth2-proxy-Auth-Gate auf Prod, App-Status = direkte Antwort (dev
  // oder Skip-Auth-Pfad). Payload-Asserts laufen nur im App-Status-Zweig.
  test('T14: /api/config reports the brand', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/api/config`, { maxRedirects: 0 });
    expect([200, 302]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body.brand).toBe('string');
    }
  });

  test('T15: /api/templates lists coaching templates, unknown id 404s', async ({ request }) => {
    const list = await request.get(`${BRETT_URL}/api/templates`, { maxRedirects: 0 });
    expect([200, 302]).toContain(list.status());
    if (list.status() === 200) {
      expect(Array.isArray(await list.json())).toBe(true);
    }
    const one = await request.get(`${BRETT_URL}/api/templates/no-such-template`, { maxRedirects: 0 });
    expect([302, 404]).toContain(one.status());
    if (one.status() === 404) {
      expect((await one.json()).error).toBe('not_found');
    }
  });

  test('T16: /api/board-templates lists board templates', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/api/board-templates`, { maxRedirects: 0 });
    expect([200, 302]).toContain(res.status());
    if (res.status() === 200) {
      expect(Array.isArray(await res.json())).toBe(true);
    }
  });

  test('T17: /api/join with unknown code 404s', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/api/join?code=unknown-code-e2e`, { maxRedirects: 0 });
    expect([302, 404]).toContain(res.status());
    if (res.status() === 404) {
      expect(await res.text()).toContain('Session-Code');
    }
  });

  test('T18: invalid share/zuschauer API tokens 404 with invalid_token', async ({ request }) => {
    for (const kind of ['share', 'zuschauer']) {
      const res = await request.get(`${BRETT_URL}/api/${kind}/this-token-does-not-exist`, { maxRedirects: 0 });
      expect([302, 404]).toContain(res.status());
      if (res.status() === 404) {
        expect((await res.json()).error).toBe('invalid_token');
      }
    }
  });

  test('T19: invalid zuschauer page shows an error', async ({ request }) => {
    const res = await request.get(`${BRETT_URL}/zuschauer/this-token-does-not-exist`, { maxRedirects: 0 });
    expect([302, 404]).toContain(res.status());
    if (res.status() === 404) {
      expect(await res.text()).toMatch(/ungültig/i);
    }
  });

  test('T20: admin/session endpoints gate anonymous callers', async ({ browser }) => {
    // Explizit leerer State: `browser.newContext()` erbt im
    // brett-mentolder-Projekt sonst die Admin-Cookies aus `use.storageState`
    // und der Gate-Test wäre leer (Beleg: T20/T21-Rotlauf 2026-10-09).
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const gated: Array<[string, number[]]> = [
        [`${BRETT_URL}/api/sessions?room=e2e-gate`, [302, 403]],
        [`${BRETT_URL}/api/admin/rooms`, [302, 403]],
        [`${BRETT_URL}/api/applications`, [302, 403]],
        [`${BRETT_URL}/api/state?room=e2e-gate`, [302, 401]],
      ];
      for (const [url, ok] of gated) {
        const res = await ctx.request.get(url, { maxRedirects: 0 });
        expect(ok, `gate for ${url}`).toContain(res.status());
      }
      const login = await ctx.request.post(`${BRETT_URL}/auth/e2e-login`, {
        maxRedirects: 0,
        data: { userId: 'gate-probe', name: 'Gate' },
      });
      expect([302, 403]).toContain(login.status());
    } finally {
      await ctx.close();
    }
  });

  test('T21: /auth/me reports unauthenticated for anonymous callers', async ({ browser }) => {
    // Explizit leerer State (siehe T20): mit Admin-Cookies antwortet
    // /auth/me wahrheitsgemäß mit authenticated:true.
    const ctx = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const res = await ctx.request.get(`${BRETT_URL}/auth/me`, { maxRedirects: 0 });
      expect([200, 302]).toContain(res.status());
      if (res.status() === 200) {
        expect((await res.json()).authenticated).toBe(false);
      }
    } finally {
      await ctx.close();
    }
  });

  // ── Authenticated data API tests (brett-mentolder project) ──────────────
  // These require storageState from .auth/mentolder-brett.json.
  // When run in the services project (no storageState), they are skipped.
  // T901676-Audit: das alte PLAYWRIGHT_PROJECT-Env-Gate war tot (die Variable
  // setzt niemand — die Tests skipten überall). Jetzt Projektname + State.
  test.describe('data API tests (authenticated)', () => {
    test.beforeEach(async ({}, testInfo) => {
      test.skip(
        testInfo.project.name !== 'brett-mentolder' || !hasAuthState(),
        'requires brett-mentolder project with storageState (.auth/mentolder-brett.json)',
      );
    });

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
      // T901676-Audit: accessories folgt dem Slot-Objekt-Schema
      // ({head, upper, feet}), kein Array (validateAppearance).
      const createRes = await request.post(`${BRETT_URL}/presets`, {
        data: { name: 'e2e-preset', appearance: { face: undefined, accessories: {} } },
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

    // ── T901676-Audit: Admin-/Session-API (Replay-Fundament) ───────────────
    test('T22: GET /api/sessions without room returns 400', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/sessions`);
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatch(/room required/i);
    });

    test('T23: GET /api/sessions/:room/events for unknown room returns empty list', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/sessions/e2e-probe-${Date.now()}/events`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.events)).toBe(true);
      expect(body.events).toHaveLength(0);
    });

    test('T24: GET /api/sessions/:room/snapshot for unknown room returns empty state', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/sessions/e2e-probe-${Date.now()}/snapshot`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.state?.figures)).toBe(true);
      expect(typeof body.recordedAt).toBe('string');
    });

    test('T25: GET /api/admin/rooms returns an array', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/api/admin/rooms`);
      expect(res.status()).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });

    test('T26: /auth/me reports the admin session', async ({ request }) => {
      const res = await request.get(`${BRETT_URL}/auth/me`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(true);
      expect(body.isAdmin).toBe(true);
    });

    test('T27: POST /api/board-templates roundtrip creates and deletes', async ({ request }) => {
      const create = await request.post(`${BRETT_URL}/api/board-templates`, {
        data: { name: `e2e-tpl-${Date.now()}`, state: { figures: [] } },
      });
      expect(create.status()).toBe(201);
      const created = await create.json();
      expect(typeof created.id).toBe('string');

      const del = await request.delete(`${BRETT_URL}/api/board-templates/${created.id}`);
      expect(del.status()).toBe(204);

      const delAgain = await request.delete(`${BRETT_URL}/api/board-templates/${created.id}`);
      expect(delAgain.status()).toBe(404);
    });

    test('T28: POST /api/board-templates validates name and state', async ({ request }) => {
      const noName = await request.post(`${BRETT_URL}/api/board-templates`, {
        data: { state: { figures: [] } },
      });
      expect(noName.status()).toBe(400);

      const noState = await request.post(`${BRETT_URL}/api/board-templates`, {
        data: { name: 'e2e-no-state' },
      });
      expect(noState.status()).toBe(400);
    });
  });
});

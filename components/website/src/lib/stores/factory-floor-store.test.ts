import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import type { FloorPayload } from '../factory-floor-types';

const fake = { fetchedAt: '2026-07-15T00:00:00Z', hall: [], staged: [] } as unknown as FloorPayload;

beforeEach(() => { vi.resetModules(); });

describe('factory-floor-store', () => {
  it('seedFloor caches the SSR payload', async () => {
    const m = await import('./factory-floor-store');
    m.seedFloor(fake);
    expect(get(m.floorStore).payload).toEqual(fake);
  });
  it('ingestFloorPayload replaces the payload and clears stale', async () => {
    const m = await import('./factory-floor-store');
    m.ingestFloorPayload(fake);
    expect(get(m.floorStore).payload).toEqual(fake);
    expect(get(m.floorStore).stale).toBe(false);
  });
  it('acquireFloor ref-counts and releases at zero', async () => {
    const m = await import('./factory-floor-store');
    m.seedFloor(fake);
    const r1 = m.acquireFloor();
    const r2 = m.acquireFloor();
    expect(m.floorSubscriberCount()).toBe(2);
    r1(); r2();
    expect(m.floorSubscriberCount()).toBe(0);
  });
});

// [T003459] getSharedMetrics fetchte '/api/factory-metrics'. Diese Route gibt es
// nicht — der Endpunkt liegt unter '/sdlc/api/factory-metrics'. Jeder Aufruf lief
// in einen 404, r.json() warf auf der HTML-Fehlerseite, die Promise rejectete.
// Weil der Fehler still verschluckt wurde, sahen die Konsumenten nur '—'.
describe('getSharedMetrics', () => {
  const OK = { brand: 'mentolder', metrics: [], activeFeatures: [], flags: [] };

  function mockFetch() {
    const spy = vi.fn(async (url: string) => {
      if (url === '/sdlc/api/factory-metrics') {
        return { ok: true, status: 200, json: async () => OK } as unknown as Response;
      }
      // Astro liefert für unbekannte Routen eine HTML-Fehlerseite, kein JSON.
      return {
        ok: false,
        status: 404,
        json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('ruft den Endpunkt unter seinem tatsächlichen Pfad auf', async () => {
    const spy = mockFetch();
    const m = await import('./factory-floor-store');

    await expect(m.getSharedMetrics(true)).resolves.toMatchObject({ brand: 'mentolder' });
    expect(spy).toHaveBeenCalledWith('/sdlc/api/factory-metrics', expect.anything());
  });

  it('meldet einen HTTP-Fehler, statt ihn als leere Payload durchzureichen', async () => {
    // Positiv-Anker: der Erfolgsfall oben liefert Daten — die Ablehnung hier
    // ist also eine Aussage über das Fehlerverhalten, nicht über einen
    // generell kaputten Aufruf.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'fetch_failed' }),
    } as unknown as Response)));
    const m = await import('./factory-floor-store');

    await expect(m.getSharedMetrics(true)).rejects.toThrow(/500/);
  });

  it('cached den Erfolgsfall und fetcht nicht erneut', async () => {
    const spy = mockFetch();
    const m = await import('./factory-floor-store');

    await m.getSharedMetrics(true);
    await m.getSharedMetrics();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('cached einen Fehler NICHT — der nächste Aufruf versucht es erneut', async () => {
    let attempt = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
      return { ok: true, status: 200, json: async () => OK } as unknown as Response;
    }));
    const m = await import('./factory-floor-store');

    await expect(m.getSharedMetrics(true)).rejects.toThrow();
    // Ein gecachter Fehlschlag hätte die Kachel dauerhaft auf '—' festgenagelt.
    await expect(m.getSharedMetrics()).resolves.toMatchObject({ brand: 'mentolder' });
  });
});

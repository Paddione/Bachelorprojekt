// tests/unit/cockpit-daemon-response.test.ts
// Ticket: T901934 — shared responder der Daemon-Routen
//
// Pruefmodus (Test-Resultats-Konvention T002448-M4): ERGEBNIS-basiert. Die Tests
// rufen cachedJson() wirklich auf und pruefen Payload, Key-Reihenfolge und
// Cache-Eintrag — kein grep im Quelltext.
//
// routes/_shared.ts zieht `hono` nur als import type (wird wegoptimiert);
// der Import bleibt damit ladbar wie lib/cache.ts.
import { describe, it, expect } from 'vitest';
import { cachedJson } from '../../.lavish/kit/daemon/routes/_shared';
import { getCached } from '../../.lavish/kit/daemon/lib/cache';

function fakeCtx() {
  return { json: (payload: unknown) => payload } as any;
}

describe('Daemon routes — cachedJson', () => {
  it('liefert { [dataKey]: data, fetchedAt } und schreibt den Cache', async () => {
    const out: any = await cachedJson(fakeCtx(), 't-resp-ok', 30_000, 'warnings', async () => [{ id: 1 }]);

    expect(out.warnings).toEqual([{ id: 1 }]);
    // Key-Reihenfolge wie zuvor inline: Daten zuerst, fetchedAt danach.
    expect(Object.keys(out)).toEqual(['warnings', 'fetchedAt']);
    expect(out.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    const entry = getCached('t-resp-ok');
    expect(entry?.data).toEqual([{ id: 1 }]);
    expect(entry?.fetchedAt).toBe(out.fetchedAt);
  });

  it('liefert { error, fetchedAt } wenn der Fetcher wirft', async () => {
    const out: any = await cachedJson(fakeCtx(), 't-resp-err', 30_000, 'runs', async () => {
      throw new Error('boom');
    });

    expect(out.error).toBe('boom');
    expect(Object.keys(out)).toEqual(['error', 'fetchedAt']);
    expect(getCached('t-resp-err')).toBeUndefined();
  });
});

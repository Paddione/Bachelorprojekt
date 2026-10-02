// routes/epics.ts — GET /api/cockpit/epics (K5)
//
// Duenne Hono-Schicht ueber sources/epics.ts. Die Daten-Beschaffung liegt
// bewusst dort, weil `hono` in keiner package.json deklariert ist und ein Test,
// der diese Datei importiert, damit in CI nicht lauffaehig waere.
import type { Context } from 'hono';
import { setCache, getCached, isFresh } from '../lib/cache';
import { getEpics, type EpicSummary } from '../sources/epics';

export type { EpicSummary };

const BRAND = 'mentolder'; // E16, wie im Adapter

export async function epicsHandler(c: Context) {
  try {
    const cached = getCached<EpicSummary[]>('epics');
    if (cached && isFresh(cached)) {
      return c.json({ epics: cached.data, fetchedAt: cached.fetchedAt });
    }

    const epics = await getEpics(BRAND);
    const entry = setCache('epics', epics, 60_000);
    return c.json({ epics, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    // D13: der Fehler wird benannt, statt als leere Liste getarnt zu werden.
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

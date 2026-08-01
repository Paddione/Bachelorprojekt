// routes/epics.ts — GET /api/cockpit/epics, GET /api/cockpit/epics/:id/changes-since (K5)
//
// Duenne Hono-Schicht ueber sources/epics.ts. Die Daten-Beschaffung liegt
// bewusst dort, weil `hono` in keiner package.json deklariert ist und ein Test,
// der diese Datei importiert, damit in CI nicht lauffaehig waere.
import type { Context } from 'hono';
import { setCache, getCached, isFresh } from '../lib/cache';
import { getEpics, hasChangesSince, isValidIsoTimestamp, type EpicSummary } from '../sources/epics';

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

/**
 * OF1 — wurde openspec/changes/ seit dem letzten Canvas-Export veraendert?
 *
 * Der Canvas darf nur die Teile ueberschreiben, die er selbst verfasst hat. Wo
 * das nicht sicher entscheidbar ist, muss der Nutzer gefragt werden — deshalb
 * ist die konservative Antwort hier `hasChanges: true`. Ein fehlender oder
 * ungueltiger Zeitstempel ist KEIN Freibrief: ohne Bezugspunkt laesst sich
 * nichts ausschliessen, also gilt "moeglicherweise geaendert". Die
 * Vorgaengerfassung antwortete bei fehlendem ts mit `hasChanges: false` und
 * haette damit ausgerechnet im unklarsten Fall zum Ueberschreiben geraten.
 */
export async function epicsChangesSinceHandler(c: Context) {
  const ts = c.req.query('ts');

  if (!ts || !isValidIsoTimestamp(ts)) {
    return c.json({
      hasChanges: true,
      reason: 'kein gueltiger Bezugszeitpunkt',
      fetchedAt: new Date().toISOString(),
    });
  }

  try {
    const hasChanges = await hasChangesSince(ts);
    return c.json({ hasChanges, fetchedAt: new Date().toISOString() });
  } catch (e: any) {
    return c.json({
      hasChanges: true,
      error: e.message,
      fetchedAt: new Date().toISOString(),
    });
  }
}

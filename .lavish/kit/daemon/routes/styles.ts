// routes/styles.ts — GET /api/cockpit/styles (K9, T002468)
//
// Duenne Hono-Schicht ueber sources/styles.ts. Die Leselogik liegt dort, weil
// `hono` in keiner package.json deklariert ist und ein Test, der diese Datei
// importiert, damit in CI nicht lauffaehig waere.
import type { Context } from 'hono';
import { setCache, getCached, isFresh } from '../lib/cache';
import { readEntries, indexDrift, readIndex, type StyleEntryFull } from '../sources/styles';

export async function stylesHandler(c: Context) {
  try {
    const cached = getCached<StyleEntryFull[]>('styles');
    if (cached && isFresh(cached)) {
      return c.json({ entries: cached.data, fetchedAt: cached.fetchedAt });
    }

    const [index, entries] = await Promise.all([readIndex(), readEntries()]);

    // D14 Regel 3 ist eine Zusage an die Modelle: was im Kit liegt, steht auch
    // im Verzeichnis. Driftet beides auseinander, wird das gemeldet statt
    // stillschweigend die eine oder andere Haelfte auszuliefern.
    const drift = indexDrift(index, entries);
    const warnings: string[] = [];
    if (drift.missingInIndex.length) {
      warnings.push(`nicht im Verzeichnis: ${drift.missingInIndex.join(', ')}`);
    }
    if (drift.missingAsFile.length) {
      warnings.push(`im Verzeichnis, aber ohne Datei: ${drift.missingAsFile.join(', ')}`);
    }

    // Die Stil-Datenbank aendert sich nur, wenn jemand einen Eintrag beitraegt
    // — ein langes TTL genuegt.
    const entry = setCache('styles', entries, 300_000);
    return c.json({
      entries,
      ...(warnings.length ? { warnings } : {}),
      fetchedAt: entry.fetchedAt,
    });
  } catch (e: any) {
    // D13: der Fehler wird benannt, nicht als leere Sammlung getarnt. Eine
    // nicht lesbare Quelle sieht sonst aus wie "es gibt keine Stile".
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

# Partial p2 — Daemon-Route: /api/cockpit/epics

**Ticket:** T002464
**Rolle:** `epics-route`
**Ziel-Dateien:** `.lavish/kit/daemon/routes/epics.ts`
**Abhängigkeiten:** K2-Daemon (server.ts, Routes-Struktur)

## Ziel

Neuen Hono-Endpoint `/api/cockpit/epics` im Daemon. Liefert eine Liste laufender Epics (Tickets mit type=project oder type=epic). Daten aus ticket-mcp.

## .lavish/kit/daemon/routes/epics.ts

```ts
// routes/epics.ts — GET /api/cockpit/epics (K5)
import type { Context } from 'hono';
import { exec } from '../lib/exec';
import { setCache, getCached, isFresh } from '../lib/cache';

export interface EpicSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  childCount: number;
}

async function fetchEpics(): Promise<EpicSummary[]> {
  // Ruft tickets vom Typ 'project' oder 'feat' mit Epic-Status ab
  const result = await exec(
    'bash scripts/vda/ticket.sh list --type project,feat --status planning,plan_staged,in_progress --json 2>/dev/null || echo "[]"',
    10000
  );

  if (!result.ok || !result.stdout) {
    return [];
  }

  try {
    const tickets = JSON.parse(result.stdout);
    return tickets.map((t: any) => ({
      id: t.external_id || t.id,
      title: t.title || '',
      status: t.status || 'unknown',
      priority: t.priority || 'mittel',
      childCount: 0,
    }));
  } catch {
    return [];
  }
}

export async function epicsHandler(c: Context) {
  try {
    const cached = getCached<EpicSummary[]>('epics');
    if (cached && isFresh(cached)) {
      return c.json({ epics: cached.data, fetchedAt: cached.fetchedAt });
    }

    const epics = await fetchEpics();
    const entry = setCache('epics', epics, 60_000); // 1 min TTL
    return c.json({ epics, fetchedAt: entry.fetchedAt });
  } catch (e: any) {
    return c.json({ error: e.message, fetchedAt: new Date().toISOString() });
  }
}

export async function epicsChangesSinceHandler(c: Context) {
  // Liefert ob sich openspec/changes/<slug>/ seit Zeitstempel geändert hat
  // Wird vom Canvas-Store (hasExternalChanges) aufgerufen
  const ts = c.req.query('ts');
  if (!ts) return c.json({ hasChanges: false });

  try {
    const result = await exec(
      `git log --oneline --since="${ts}" -- openspec/changes/ 2>/dev/null | wc -l`,
      5000
    );
    const count = parseInt(result.stdout, 10);
    return c.json({ hasChanges: count > 0 });
  } catch {
    return c.json({ hasChanges: true });
  }
}
```

## Integration in server.ts

In server.ts importieren und Route registrieren:

```ts
import { epicsHandler, epicsChangesSinceHandler } from './routes/epics';
// ...
app.get('/api/cockpit/epics', epicsHandler);
app.get('/api/cockpit/epics/:id/changes-since', epicsChangesSinceHandler);
```

## Abnahmekriterien

1. `curl http://127.0.0.1:49152/api/cockpit/epics` gibt JSON-Array zurück
2. Antwort enthält `fetchedAt` (D12)
3. Bei ticket-mcp-Ausfall: `error`-Feld statt leerer Liste (D13)

# p4 — API-Routen

_Ticket: T013306 · Rolle: impl · depends_on: p2, p3_

## Zieldateien

- `components/website/src/pages/sdlc/api/health-goals/rescan.ts` (NEU, ca. 60 Zeilen)
- `components/website/src/pages/sdlc/api/health-goals/tickets.ts` (NEU, ca. 65 Zeilen)

Vorbild für Aufbau, Auth und Timeout: `components/website/src/pages/sdlc/api/tests/report.ts`.

## Aufgaben (beide Routen)

- [ ] `export const prerender = false;` setzen — beide Routen sind serverseitig.

- [ ] Admin-Guard als erstes im Handler, vor jeder Validierung und vor jedem `spawn`:

```ts
const session = await getSession(request.headers.get('cookie'));
if (!session || !isAdmin(session)) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}
```

      Import aus `components/website/src/lib/auth` (`getSession` Zeile 241, `isAdmin` Zeile 233).

- [ ] Body lesen und validieren: `{ ids: string[] }`. Kein Array oder leeres Array → `400`. Eine
      Obergrenze setzen (Vorschlag: 25 IDs je Anfrage) — ein Rescan über alle 103 Ziele wäre ein
      Vollscan über eine HTTP-Anfrage und liefe ins Timeout.

- [ ] IDs gegen `GOALS` aus `components/website/src/lib/sdlc/goals-data` prüfen. Unbekannte ID →
      `400`, die abgelehnte ID benennen, nichts spawnen. Die Prüfung findet damit zweimal statt:
      hier und im Wrapper. Das ist beabsichtigt — der Wrapper ist auch von der Kommandozeile
      aufrufbar und darf sich nicht auf einen Aufrufer verlassen.

## Aufgaben `rescan.ts`

- [ ] `POST` → `runHealthScan(ids)` aus `lib/sdlc/health-scan`. Antwort:
      `{ results: ScanResult[], scannedAt: <ISO-Zeitstempel> }`.

- [ ] Eingabefehler des Wrappers (Exit 2) → `400`, sonstiger Fehler → `500` mit kurzer Meldung.
      Niemals `{ results: [] }` mit Status 200 bei einem Fehler zurückgeben: das Dashboard könnte
      das nicht von „nichts gefunden" unterscheiden.

## Aufgaben `tickets.ts`

- [ ] `POST` → die passenden `HealthGoal`-Objekte aus `GOALS` heraussuchen und an
      `createGoalTickets` aus `lib/sdlc/health-goal-tickets` geben. Antwort:
      `{ outcomes: TicketOutcome[] }` — die Route fasst nicht zusammen, das Dashboard rendert die
      Einzelergebnisse.

- [ ] Teilerfolg ist `200`: einzelne `failed`-Einträge stehen im Body, nicht im HTTP-Status.
      Ein `500` würde die erfolgreich angelegten Tickets im Frontend unsichtbar machen.

## Abschluss dieses Partials

```bash
cd components/website && pnpm exec astro check --minimal 2>&1 | tail -20
```

Fällt `astro check` in diesem Checkout aus, ersatzweise `pnpm exec tsc --noEmit -p tsconfig.json`.
Der Punkt ist ein Typprüfungs-Nachweis, nicht das konkrete Werkzeug.

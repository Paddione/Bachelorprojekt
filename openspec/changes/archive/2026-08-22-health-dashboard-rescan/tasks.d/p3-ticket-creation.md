# p3 — Ticket-Erzeugung aus markierten Zielen

_Ticket: T013306 · Rolle: impl · depends_on: —_

Setzt REQ-HEALTH-GOALS-014 um. Vorbild ist `scripts/code-quality/loop.sh` — dort steht das
Dedup-Verfahren, das hier wiederverwendet wird.

## Zieldateien

- `components/website/src/lib/sdlc/health-goal-tickets.ts` (NEU, ca. 135 Zeilen)
- `components/website/src/lib/sdlc/health-goal-tickets.test.ts` (NEU)

## Aufgaben

- [ ] Öffentliche Oberfläche:

```ts
export interface TicketOutcome {
  id: string;                       // Goal-ID
  status: 'created' | 'skipped' | 'failed';
  ticketId?: string;                // external_id bei created
  existingTitle?: string;           // bei skipped: der bereits offene Titel
  error?: string;                   // bei failed
}
export function goalTicketTitlePrefix(goalId: string): string;
export function goalTicketDescription(goal: HealthGoal): string;
export async function createGoalTickets(goals: HealthGoal[]): Promise<TicketOutcome[]>;
```

      `HealthGoal` kommt aus `components/website/src/lib/sdlc/goals-data.ts` — nicht neu
      deklarieren.

- [ ] Titel-Präfix stabil und ID-tragend wählen, damit die Dedup-Abfrage über die Zeit greift.
      Vorschlag: `HEALTH:<GOAL-ID>` — der Rest des Titels (Kurztitel des Ziels) darf sich ändern,
      ohne die Deduplizierung zu brechen. Genau dafür trennt `loop.sh` Präfix und Volltitel.

- [ ] Beschreibung erzeugen. Sie MUSS Ziel-ID, dokumentierten Ist-Wert, Zielwert, Richtung
      (`lower`/`higher`), den Mess-Befehl (`goal.measurement`) und die Quelle (`goal.source`)
      enthalten — das ist die Mess-Konvention aus `CLAUDE.md`: eine Zahl ohne den Befehl, der sie
      erzeugt hat, ist kein Beleg. Länge wie in `loop.sh` auf 2000 Zeichen begrenzen; ein
      abgeschnittener Mess-Befehl wäre wertlos, deshalb den Befehl vor die Prosa setzen.

- [ ] Dedup gegen offene Tickets. Dieselbe Semantik wie `has_open_ticket()`
      (`scripts/code-quality/loop.sh:51-63`): Titel beginnt mit dem Präfix, Status ist nicht
      `done`, `archived` oder `wont-fix`. Abfrage über den vorhandenen `pool` aus
      `components/website/src/lib/website-db` — dieselbe Verbindung, über die
      `pages/sdlc/api/factory-control.ts` bereits `tickets.*` liest. Parametrisiert abfragen
      (`$1`), nicht per String-Interpolation:

```sql
SELECT external_id, title FROM tickets.tickets
 WHERE title LIKE $1 || '%' AND status NOT IN ('done','archived','wont-fix')
 LIMIT 1
```

- [ ] Anlage über `spawn('bash', ['scripts/ticket.sh', 'create', '--type', 'feat', '--brand',
      'mentolder', '--title', title, '--description', description, '--priority', 'mittel'])`,
      cwd `findRepoRoot()` aus `p2`. Rückgabe ist `external_id|uuid`; die `external_id` ist Feld 1.
      Argument-Array, keine Shell.

- [ ] **Kein** `ticket.sh enqueue`. Der Dispatch bleibt eine ausdrückliche Operator-Entscheidung
      (D2 im Proposal).

- [ ] Ein Fehlschlag bei einem Ziel darf die übrigen nicht abbrechen: je Ziel ein `TicketOutcome`,
      Fehler als `status: 'failed'` mit Meldung. Eine leere `external_id` ist ein Fehler, kein
      Erfolg — `loop.sh` bricht an dieser Stelle bewusst ab, hier wird sie als `failed` gemeldet.

- [ ] `health-goal-tickets.test.ts` (Vitest), `pool.query` und `spawn` gemockt:
      - Vorhandenes offenes Ticket → `status: 'skipped'`, `existingTitle` gesetzt, `spawn` wurde
        **nicht** aufgerufen.
      - Kein offenes Ticket → `spawn` aufgerufen, `ticketId` aus Feld 1 der Rückgabe geparst.
      - Beschreibung enthält Goal-ID, Ist, Soll, Mess-Befehl und Quelle (positiv geprüft, nicht
        über die Abwesenheit von Platzhaltern).
      - Leere `external_id` → `status: 'failed'`.
      - Zwei Ziele, das erste schlägt fehl → das zweite wird trotzdem verarbeitet.

## Abschluss dieses Partials

```bash
cd components/website && pnpm vitest run src/lib/sdlc/health-goal-tickets.test.ts
```

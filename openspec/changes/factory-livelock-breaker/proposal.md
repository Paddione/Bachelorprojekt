# Proposal: factory-livelock-breaker

## Why

Bricht ein erzwungener Dry-Run ab, bevor er seinen Marker setzt, kann das Ticket den
Dry-Run-First-Zustand nie verlassen. `guard_dryrun_ok` ist fail-closed und sieht weiterhin
keinen Marker, der nächste Dispatch erzwingt erneut `dry_run=true`. Der Watchdog wirft das
stale `in_progress` alle 30 Minuten zurück in die Queue, die Queue dispatcht binnen ~60
Sekunden erneut, die Pipeline stirbt wieder. Jede Runde startet eine headless
`claude -p`-Session. Es gibt weder einen Zähler, noch ein Limit, noch eine Eskalation.

Beobachtet am 2026-07-27 an T002282 (~7 Zyklen ab 13:29 UTC), T002307 und T002338. Auslöser
waren in diesem Fall `ConnectionRefused`-Abbrüche gegen `ANTHROPIC_BASE_URL`. Nicht der
Backend-Ausfall ist der Befund, sondern dass ein beliebiger, auch kurzer Ausfall ein Ticket
in eine Schleife ohne Selbstheilung und ohne Sichtbarkeit überführt.

Der archivierte Change `2026-07-14-factory-dryrun-mark-loop` (T001816) hat dieselbe
Bugklasse für den Fall geschlossen, dass der Dry-Run *durchläuft*. Dies ist der
unabgedeckte Zweig: Abbruch *davor*. Zweiter Produktivvorfall derselben Konstruktion —
daher wird diesmal die Schleife selbst begrenzt, statt einen weiteren Marker-Pfad zu
ergänzen.

Zusätzlich hängt der Marker heute an Modell-Compliance: `ticket.sh dryrun-mark` steht als
Textanweisung *innerhalb* des Agent-Prompts. Ein zwingender Zustandsübergang, der eine
Schleife verlässt, darf nicht davon abhängen, ob ein Modell eine Prompt-Zeile befolgt.

## What

- **Attempt-Zähler mit Fortschritts-Reset** in `scripts/factory/watchdog.sh`: Key
  `factory_attempt:<ext_id>` in `tickets.factory_control`, geschrieben mit non-NULL `brand`
  (NULL-Brand-Rows umgehen `ON CONFLICT`, siehe T000474). Ist ein
  `factory_phase_events`-Eintrag neuer als der Zähler-Write, gab es echten Fortschritt →
  Zähler auf 1; sonst +1.
- **`unfactory`-Terminalzustand**: neues `ticket.sh unfactory --id`, das `status=blocked`,
  `attention_mode=needs_human` und `readiness.factory_excluded=true` in einem Block setzt.
  `scripts/factory/queue.sh` schließt `factory_excluded`-Tickets in **beiden**
  Dispatch-Zweigen aus, damit der Ausschluss einen späteren Statuswechsel überlebt.
- **Deterministischer `dryrun-mark`**: der Aufruf wandert im `DRY_RUN`-Zweig von
  `scripts/factory/pipeline.mjs` aus dem Agent-Prompt in Code nach dem `agent()`-Return.
- Regressionstests in `tests/spec/software-factory.bats`.

Keine Datenbankmigration: `factory_control.updated_at` und `factory_phase_events.at`
existieren bereits, inklusive Index `factory_phase_events_ticket_at_idx`.

Nicht enthalten: die Modell-Eskalationsleiter (T002369, `blocked_by` T002359) und der
slot-gebundene Kontextraum (T002370). `guard_dryrun_ok` bleibt fail-closed.

_Ticket: T002361_

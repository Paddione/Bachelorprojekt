# Proposal: mishap-t002407

## Why

Der aktuelle Mishap-Tracker erzeugt Bundle-Tickets (ein Ticket pro N Mishaps). Das führt zu zwei Problemen:

1. **Incident-Eskalation:** `broken` und `security`-Mishaps landen im selben Bundle wie nicht-kritische Einträge — sie unterscheiden sich nur durch `severity=major`. Es gibt keinen Typ, der sofort ein separates Ticket mit `attention_mode=needs_human` erzwingt, und kein Dispatch-Gate, das Incident-Tickets von der automatischen Factory-Verarbeitung ausschließt.

2. **Bundle-Flutter:** Jedes Bundle ist ein eigenes Ticket mit eigenem Branch und PR. Die zwölf offenen Bundles (T002325, T002342 u.a.) belegen, dass dieser Mechanismus nicht konvergiert.

Die Go-Implementierung (`mishap.go`) enthält bereits den vollständigen Rollup-Container-Mechanismus (`ROLLUP_TICKET_TITLE`, `isIncidentType`, `findOrCreateRollupTicket`, `appendToRollupContainer`). Was fehlt, ist die Integration in die umgebende Infrastruktur: DB-Typ, Queue-Ausschluss, Cockpit-Label, Rollup-Treiber-Script, Merge-Recycling und Tests.

## What

1. **DB-Typ `incident`.** In den CHECK-Constraint von `tickets.tickets.type` aufnehmen — in `migrate-type-vocabulary.ts` (Migration) und `tables/tickets.ts` (Inline-CREATE). `TYPE_LABELS.incident` in `cockpit-labels.ts`.

2. **Queue-Ausschluss.** `queue.sh` Lane 47 erweitert von `type <> 'project'` auf `type NOT IN ('project','incident')`, sodass Incident-Tickets nie automatisch dispatched werden.

3. **Rollup-Treiber `scripts/factory/mishap-rollup.sh`.** Bash-Script (angelehnt an `auto-chore-plan.sh`) für den persistenten Branch `chore/mishap-rollup`. Erzeugt aus akkumulierten Container-Kommentaren einen Plan, staged ihn und schaltet den Container scharf.

4. **Merge-Recycling.** `auto-close-merged.sh` erkennt den Container-Titel und setzt ihn nach Merge zurück auf `plan_staged + execution_released=false` statt `done/shipped`.

5. **Tick-Integration.** `wakeup.sh` ruft `mishap-rollup.sh` pro Brand nach dem Mishap-Flush auf.

6. **Skills-Dokumentation.** `.claude/skills/mishap-tracker/SKILL.md` aktualisiert auf Incident-Routing und Rollup-Container-Semantik.

7. **Tests.** Go-Tests für den Incident-Pfad erweitern, BATS-Tests für incident-Typ, Queue-Ausschluss und Container-Lifecycle.

_Ticket: T002407 · Abhängigkeit: T002390 (gemergt)_

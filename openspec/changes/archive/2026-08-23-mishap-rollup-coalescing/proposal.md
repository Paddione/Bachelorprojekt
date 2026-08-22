# Proposal: mishap-rollup-coalescing

## Why

Am 2026-08-22 entstanden 18 Rollup-Container (T013895–T013913) in 40 Minuten, drei parallele
Factory-Runs kollidierten auf Slot 1 und blockierten die Factory (3/3 Slots belegt). Die
Ursachenkette ist per DB-Evidenz belegt:

1. Der Carry-over-Marker ist containergebunden — jeder neue Container sieht ihn nicht und
   bekommt den Übertrag des letzten Zyklus erneut (T013895: „Carry-over aus T013328" um
   19:50:07, `FACTORY-PLAN-REF` 14 Sekunden später).
2. Der Generator stagte jeden Container sofort ab 1 Eintrag (`stage-plan --no-hold`) — der
   Carry-over-Batch zählt als echter Batch (Beginnt mit `### Mishap-Rollup`).
3. Damit verließ jeder Container den Collect Mode nach Sekunden; Flusher und Carry-over legten
   im Tick-Takt (~2 Minuten) neue Container an, die wieder sofort gestagt wurden.

## What

Coalescing-Gate in `scripts/factory/mishap-rollup.sh`: Nach der `BATCH_COUNT`-Ermittlung und
vor der Worktree-Anlage bricht der Generator ab (Log-Zeile, Exit 0, kein Worktree, kein
Staging), solange der Container unter der Schwelle liegt: weniger als `ROLLUP_MIN_ENTRIES`
(Default 3) Einträge **und** der älteste Batch-Eintrag jünger als `ROLLUP_MAX_AGE_H`
(Default 24) Stunden. Container bleiben damit im Collect Mode und sammeln Flush-Batches und
Carry-over über mehrere Ticks — Flusher und Carry-over finden denselben Container wieder und
legen keine neuen an. Carry-over, Eskalation (T013305), Watchlist und Archive-Janitor bleiben
unverändert.

Nicht im Scope: die Slot-Kollision im Dispatcher (drei Runs auf Slot 1) — separates Ticket.

_Ticket: T013915_

# Design: mishap-rollup-coalescing (T013915)

## Root-Cause (DB-evidenz, 2026-08-22)

Container-Flut: 18 Container (T013895–T013913) in 40 Minuten, drei parallele Factory-Runs auf
Slot 1, Factory 3/3 Slots belegt.

Kette:

1. **Carry-over-Idempotenz ist containergebunden.** `rollup-carryover.sh` prüft den Marker
   „Carry-over aus <src_slug>" nur auf dem aktuellen Container. Da Container nach Sekunden
   rotierten, sah jeder neue Container den Marker nie → Übertrag wiederholte sich pro Container.
2. **Der Generator stagte sofort.** Ab `BATCH_COUNT >= 1` läuft der bestehende Pfad durch
   (Worktree, Plan, `stage-plan --no-hold`). Der Carry-over-Batch beginnt mit
   `### Mishap-Rollup` und zählt damit als echter Batch (T013043-Filter).
3. **Rotations-Takt = Tick-Takt.** Gestagter Container verlässt den Collect Mode → der nächste
   Flush/Carry-over fand keinen Collect-Container → legte einen neuen an → sofort wieder
   gestagt. Belegt: `first_comment`-Zeitstempel der 18 Container im ~2-Minuten-Abstand,
   T013895 mit `FACTORY-PLAN-REF` 14 s nach dem Carry-over-Batch.

## Fix-Ansatz

Coalescing-Gate in `scripts/factory/mishap-rollup.sh` zwischen `BATCH_COUNT`-Ermittlung
(Zeile ~246) und Worktree-Anlage (Zeile ~275):

```bash
ROLLUP_MIN_ENTRIES="${ROLLUP_MIN_ENTRIES:-3}"
ROLLUP_MAX_AGE_H="${ROLLUP_MAX_AGE_H:-24}"
```

Gate-Bedingung: `BATCH_COUNT < ROLLUP_MIN_ENTRIES` UND Alter des ältesten Batch-Kommentars
(`min(created_at)` der Batch-Kommentare auf dem Container, eigene kleine SQL-Abfrage analog
zum bestehenden `COMMENTS_FILE`-Read) `> jetzt − ROLLUP_MAX_AGE_H` Stunden → Meldung
„Container sammelt weiter (X Einträge, ältester Y) — unter der Schwelle, kein Staging" und
`exit 0` vor der Worktree-Anlage.

Container bleibt im Collect Mode → Flusher und Carry-over finden ihn wieder
(`rollup-container`-Finder, T002783) → ein Container pro Tag im Normalfall.

## Subsysteme

- `scripts/factory/mishap-rollup.sh` — einzige Produktionsdatei (Gate, Env-Defaults, Alters-SQL).
- `tests/spec/mishap-rollup/rollup-coalescing.bats` — Statement-Verifikation (T002448-M4).
- `openspec/specs/mishap-rollup.md` — ADDED Requirement via Delta.

## Edge-Cases

- **Eskalation (T013305):** läuft vor dem Gate — eskalierte Einträge promoten weiterhin sofort,
  unabhängig von der Schwelle.
- **Watchlist-Re-Injection:** synthetischer Batch im Kommentar-Strom; zählt für `BATCH_COUNT`
  wie bisher.
- **No-op ohne Worktree:** das Gate liegt vor der Worktree-Anlage, der tägliche Tick bleibt
  billig.
- **Container ohne Batches:** `BATCH_COUNT = 0` → bestehender No-op-Pfad (unverändert).
- **Env-Override 0:** `ROLLUP_MIN_ENTRIES=0` erlaubt sofortiges Staging ab 1 Eintrag
  (Notfall-Rückweg zum alten Verhalten).

# Proposal: dispatch-gate-cap-order-t014384

## Why

T006297 (merged-dispatch-gate) wird auf main durchgehend übersprungen und meldet dabei
`ok`; sobald der Slot-Pool frei genug ist, läuft er und ist ROT
(`not ok 1 ... line 121: [ "$st" = "done" ] failed`). Messung vom 2026-08-23 im Ticket.

Root Cause verifiziert (dieses Proposal, Phase A):
1. `scripts/factory/queue.sh` listet T001108 korrekt als Kandidaten (Staged-Lane,
   `is_test_data=false`, `execution_released=true`).
2. `scripts/factory/schedule.sh` bricht die Kandidaten-Schleife bei
   `global_used >= FACTORY_GLOBAL_CAP` **ab, bevor** das Merged-Gate (Zeile ~54)
   das letzte — nach `created_at` jüngste — Kandidaten-Ticket erreicht.
3. `agent-lock.sh check-merged T001108` liefert manuell `rc=1`
   (`08a4ce27c … [T001108] (#2083)`), d. h. die Close-Logik selbst ist intakt;
   sie wird unter Slot-Druck nur nie erreicht. Live-Beleg: Parallelsessions halten
   heute Slots (u. a. T014535), wodurch der Test rot wird, wo er früher grün war.

## What

1. **schedule.sh:** Das Merged-PR-Gate wird **vor** dem Global-Cap-Break ausgewertet.
   Begründung: Das Schließen eines bereits gemergten Tickets kostet keinen Slot und
   ist auch unter Kapazitätsdruck erwünscht ("geschlossen statt dispatched"). Der
   Cap-Break bleibt für den Dispatch-Pfad unverändert.
2. **Fixture-Härtung:** Der Test seedet T001108 mit historischem `created_at`, sodass
   es unter `ORDER BY … created_at ASC` vor dem Anker sortiert und deterministisch
   das Gate erreicht — unabhängig von paralleler Slot-Belegung.
3. **Skip-Semantik (Entscheidung zu Frage b):** Der `_skip_if_pool_busy`-Guard bleibt
   ein Skip (kein harter Fehler) — er schützt echte Tickets im Live-Dev-DB-Modus vor
   versehentlichem Dispatch bei Parallelität. Die Flakiness wird stattdessen durch
   (1)+(2) beseitigt. Ein zusätzliches Guard-Test-Assert dokumentiert die Erwartung.

_Ticket: T014384_

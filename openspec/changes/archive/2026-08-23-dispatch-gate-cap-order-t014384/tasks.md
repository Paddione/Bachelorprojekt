---
title: "dispatch-gate-cap-order-t014384 — Implementation Plan"
ticket_id: T014384
domains: [ci, tests]
status: completed
file_locks: ["scripts/factory/schedule.sh", "tests/spec/software-factory/merged-dispatch-gate.bats"]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dispatch-gate-cap-order-t014384 — Implementation Plan

_Ticket: T014384_ — T006297/merged-dispatch-gate: Skip bei knappem Slot-Pool maskiert
einen roten Test.

## File Structure

```
scripts/factory/schedule.sh                                — Gate vor Cap-Break ziehen
tests/spec/software-factory/merged-dispatch-gate.bats      — Fixture created_at härten
openspec/changes/dispatch-gate-cap-order-t014384/tasks.md  — dieser Plan
```

## Befund (Evidence)

- `agent-lock.sh check-merged T001108` → rc=1 (`08a4ce27c … [T001108] (#2083)`):
  Close-Logik intakt.
- `queue.sh` listet das Fixture korrekt (Staged-Lane, is_test_data=false,
  execution_released=true).
- Defekt: `schedule.sh` Zeilenfolge — der `global_used >= GLOBAL_CAP → break`
  (Schleifenkopf) läuft VOR dem Merged-Gate; unter Slot-Druck erreicht das jüngste
  Kandidaten-Ticket (ORDER BY … created_at ASC) das Gate nie. Live-Beleg 2026-08-23:
  Parallelsessions belegen Slots, Test rot bei freiem Pool (`line 121:
  [ "$st" = "done" ] failed`).

## Task List

- [x] **schedule.sh — Gate hoisten.** Den Merged-PR-Gate-Block (check-merged →
      update-status done/resolution → Close-Kommentar → continue) VOR die Zeile
      `[[ "$global_used" -ge "$GLOBAL_CAP" ]] && break` ziehen. Der Break gilt danach
      nur noch für den Dispatch-Pfad. Verhalten ohne Merge-Beleg (rc=0/2) unverändert.
- [x] **Fixture härten.** Im INSERT des Fixtures (bats-Zeile ~96) statt `now()` ein
      historisches `created_at` setzen (z. B. `now() - interval '30 days'`), damit
      T001108 deterministisch vor dem Anker und allen Echtzeit-Kandidaten sortiert.
- [x] **Skip-Semantik dokumentieren.** Kommentar am `_skip_if_pool_busy`-Guard im Test:
      Skip bleibt Skip (Schutz des Live-Dev-DB-Modus); Flakiness ist durch die beiden
      Schritte oben beseitigt, nicht durch einen harten Fehler.
- [x] **Failing-Test-Step (RED → GREEN).**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/merged-dispatch-gate.bats
# expected: FAIL (rot bei freiem Pool, Stand Ticket-Messung 2026-08-23:
#           'not ok 1 ... line 121: [ "$st" = "done" ] failed');
#           nach den zwei Fixes GREEN (bei vollem Pool sichtbarer Skip — Guard).
```

## Verify

- [x] `./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/merged-dispatch-gate.bats` → grün oder sichtbarer Skip
- [x] `./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/scheduling.bats` → keine Regression
- [x] `task test:changed` → grün
- [x] `task freshness:regenerate && task freshness:check` → grün

---
title: Watchdog-Tests gegen geteilte Dev-DB isolieren
ticket_id: T005561
status: planning
domains: [scripts, test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# test-changed-db-isolation — Implementation Plan

## File Structure

- `scripts/factory/watchdog.sh` — `_stale_query()` Test-Seed-Ausschluss (`M`)
- `tests/lib/factory-test-fixtures.sh` — `seed_test_feature` setzt Test-Marker (`M`)
- `tests/spec/software-factory/_sf_common.bash` — Test-Env-Flag-Verteilung (`M`)
- `tests/spec/software-factory/scheduling.bats` — STALE_MIN=0-Läufe isolieren (`M`)
- `tests/spec/software-factory/orphan-slot-reap.bats` — dito (`M`)
- `tests/spec/software-factory/retry-limit.bats` — dito (`M`)
- `tests/spec/software-factory/watchdog-parallel-isolation.bats` — Rot-Grün-Guard (committet) (`A`)

## Partials

### p1 — Watchdog Test-Seed-Ausschluss + Seed-Marker (Tests-Rolle)

**target_files:** `scripts/factory/watchdog.sh`, `tests/lib/factory-test-fixtures.sh`,
`tests/spec/software-factory/_sf_common.bash`, `tests/spec/software-factory/scheduling.bats`,
`tests/spec/software-factory/orphan-slot-reap.bats`,
`tests/spec/software-factory/retry-limit.bats`,
`tests/spec/software-factory/watchdog-parallel-isolation.bats`

1. Rot-Beweis: Der bereits committete Test `T005561: alle STALE_MIN=0-Watchdog-Aufrufe sind
   gegen Fremd-Seeds isoliert` läuft mit dem Testrunner bats — **expected: FAIL** (die
   STALE_MIN=0-Dateien tragen keinen Isolations-Filter):
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/watchdog-parallel-isolation.bats
   ```
2. `tests/lib/factory-test-fixtures.sh` `seed_test_feature`: Seed-Tickets mit einem
   deterministischen Test-Marker versehen (Spaltenwahl dem Implementer überlassen — notes vs.
   areas-Tag —, Kriterium: eindeutig, Test-typisch, per SQL filterbar).
3. `scripts/factory/watchdog.sh` `_stale_query()`: optionale Exklusion
   (`FACTORY_STALE_EXCLUDE_TEST_SEEDS=1` → Marker-Filter in der WHERE-Klausel). Default ohne
   Flag: unverändertes Verhalten (Produktionspfad).
4. Die drei `FACTORY_STALE_MIN=0`-Testdateien: Env-Flag `FACTORY_STALE_EXCLUDE_TEST_SEEDS=1`
   bei den Watchdog-Läufen setzen.
5. Grün-Nachweis: derselbe bats-Lauf endet mit `ok` für beide T005561-Tests (Status 0), und
   die 8 bekannten Fehlschläge (FA-SF-04/34, T002610 ×2, T003810 ×2, FA-SF-25 ×2) sind bei
   parallelem Lauf grün:
   ```bash
   ./tests/unit/lib/bats-core/bin/bats -j 4 tests/spec/software-factory/
   ```
6. `bash scripts/plan-lint.sh openspec/changes/test-changed-db-isolation/tasks.md` → PASS
7. `bash scripts/openspec.sh validate` → PASS
8. `task test:changed; task freshness:regenerate; task freshness:check`

---
slug: fix-fa-sf-25-scheduling-cap
ticket: T008757
status: active
---

# Fix: FA-SF-25 scheduling.bats Baseline-aware Caps

## Problem

`tests/spec/software-factory/scheduling.bats` fails on shared dev DB because tests hardcode `FACTORY_GLOBAL_CAP` and assume a clean DB. Foreign `in_progress` tickets with `pipeline_slot` consume slots, causing test failures.

## Tasks

### Task 1: Baseline-aware Caps

Replace hardcoded caps with dynamic calculation:
- `base_used = Summe der per-Brand slots.sh count-Werte`
- `FACTORY_GLOBAL_CAP = base_used + Headroom (2 bzw. 1)`
- `FACTORY_SLOTS_PER_BRAND` analog anheben

### Task 2: Plan-Extraktion

Letzte Zeile von `$output` ist deterministisch das Plan-JSON (WARN-Zeilen stehen davor — gleiches Muster wie FA-SF-26 watchdog).

### Task 3: Seed-Ranking

Seeds via psql auf `priority='hoch'` + `created_at=2000-01-01` setzen, damit sie in `queue.sh` (ORDER BY priority, created_at) deterministisch vor fremden Kandidaten stehen.

### Task 4: Positiv-Anker in Test 3

Der einzige geplante Eintrag MUSS der eigene Seed r1 sein (nicht mehr nur count im Intervall).

## Acceptance Criteria

- [ ] `bats tests/spec/software-factory/scheduling.bats` besteht auf geteilter Dev-DB
- [ ] Keine hardcoded Caps mehr
- [ ] Seeds deterministisch priorisiert

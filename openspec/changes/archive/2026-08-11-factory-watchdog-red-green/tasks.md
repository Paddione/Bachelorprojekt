---
title: "factory-watchdog-red-green — Implementation Plan"
ticket_id: T003487
domains: [scripts, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-watchdog-red-green — Implementation Plan

_Ticket: T003487 — Factory RED-Phase-Abbruch: Watchdog Attempt-Counter zählt entered-Events als Fortschritt_

## File Structure

```
scripts/factory/watchdog.sh                   (p1 — prog CTE filter)
openspec/specs/software-factory.md            (p1 — spec update)
tests/spec/factory/watchdog-red-green.bats    (p2 — failing test)
openspec/changes/factory-watchdog-red-green/specs/software-factory.md  (delta spec)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-watchdog-progress-filter.md` | impl | `scripts/factory/watchdog.sh`, `openspec/specs/software-factory.md` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/factory/watchdog-red-green.bats` | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der BATS-Test reproduziert: Der Attempt-Counter zählt `entered`-Events NICHT als Fortschritt. Er MUSS auf dem aktuellen Branch fehlschlagen.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/factory/watchdog-red-green.bats
# expected: FAIL (red — entered-Event wird als Fortschritt gezählt)
```

- [ ] **Fix-Step (GREEN).** Implementiere den Fix (p1 — prog CTE filter). Der BATS-Test aus dem vorherigen Schritt muss nun grün sein.

- [ ] **Final Verification.**
```bash
task test:changed
task freshness:regenerate
task freshness:check
```

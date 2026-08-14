---
title: "sf-scheduling-test-drift — Implementation Plan"
ticket_id: T005029
domains: [infra, ops, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# sf-scheduling-test-drift — Implementation Plan

_Ticket: T005029_

## File Structure

```
tests/lib/factory-test-fixtures.sh                                      (p1)
openspec/changes/sf-scheduling-test-drift/specs/software-factory.md     (p1)
tests/spec/software-factory/scheduling.bats                             (p2)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-fixtures.md` | impl | `tests/lib/factory-test-fixtures.sh`, `openspec/changes/sf-scheduling-test-drift/specs/software-factory.md` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/software-factory/scheduling.bats` | p1 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die umgeschriebenen FA-SF-24/25-Tests rufen die
      noch nicht existierenden Fixture-Helfer `seed_real_feature`/`purge_real_feature`
      auf und brechen mit status 127; FA-SF-26 prueft das escalated-JSON auf der
      letzten Output-Zeile und ist bereits gruen. Die Tests laufen gegen die k3d-
      Dev-DB und brauchen den Opt-in `TICKET_TEST_DB_OK=1` (sonst `_skip_if_no_db`).

```bash
TICKET_TEST_DB_OK=1 tests/unit/lib/bats-core/bin/bats --jobs 2 --no-parallelize-within-files \
  --filter 'FA-SF-2[45]|FA-SF-26' tests/spec/software-factory/scheduling.bats
# expected: FAIL (red — FA-SF-24 und FA-SF-25 brechen: seed_real_feature:
# command not found, status 127; FA-SF-26 ist bereits gruen)
```

- [ ] **Fix-Step (GREEN).** p1 implementiert `seed_real_feature` und
      `purge_real_feature` in `tests/lib/factory-test-fixtures.sh`; der Lauf aus
      dem vorherigen Schritt muss vollstaendig gruen sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

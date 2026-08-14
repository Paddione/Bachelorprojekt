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

- [x] **Failing-Test-Step (RED).** Die umgeschriebenen FA-SF-24/25-Tests rufen die
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

- [x] **Fix-Step (GREEN).** p1 implementiert `seed_real_feature` und
      `purge_real_feature` in `tests/lib/factory-test-fixtures.sh`; der Lauf aus
      dem vorherigen Schritt muss vollstaendig gruen sein. ERGEBNIS: 8/8 gruen
      (inkl. FA-SF-25 x3); scheduling.bats komplett 25/25 gruen; nach dem Lauf
      0 `sf-real-*`-Geisterzeilen und 0 belegte Slots in der k3d-Dev-DB.
      ZUSAETZLICH noetig war `lastenheft lock` (plan-meta --requirements):
      die Queue-Lane fuer backlog-Features verlangt
      readiness.lastenheft_locked=true — create setzt das nicht. Ohne den Lock
      bleibt das Feature der Queue unsichtbar (im ersten GREEN-Versuch belegt:
      FA-SF-24-Positiv-Anker schlug fehl).

- [x] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

BEFUND test:changed: lokal rot (8 Fehlschlaege: FA-SF-04/34, T002610 x2,
T003810 x2, FA-SF-25 x2) — ABER ausschliesslich Parallel-Kollisionen der
geteilten k3d-Dev-DB: mehrere Watchdog-Varianten (FA-SF-26, T002610) mit
STALE_MIN=0 setzen sich gegenseitig in_progress-Tickets zurueck, waehrend
conflict-check/schedule parallel dagegen arbeiten. Beleg: ALLE 8 Tests isoliert
gruen; serieller Lauf der 9 von find-changed-tests selektierten Spec-Dateien
184/184 gruen. Die Kollision betrifft auch Dateien, die nichts mit diesem Change
zu tun haben (conflict-db-triage/retry-limit untereinander) und ist nur
sichtbar, weil die geaenderte Fixture-Lib den Lauf ueberhaupt triggert. CI
(offline, ohne Cluster) skippt die Live-Tests via _skip_if_no_db — das
CI-aequivalente `task test:spec:changed` ist das eigentliche PR-Gate (T002375-p4:
lokaler Lauf strenger als das Gate). Nebenbefund: depends_on-Gate in
scripts/factory/schedule.sh referenziert `d.external_id` (existiert nicht,
Subquery liefert nur dep_id) — der Blocker-Gate faellt damit fail-open auf
leeren blocker_json; ausserhalb dieses Tickets zu fixen.

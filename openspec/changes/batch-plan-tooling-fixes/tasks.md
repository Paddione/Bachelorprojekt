---
title: "batch-plan-tooling-fixes — Implementation Plan"
ticket_id: T003641
domains: [plan-authoring, dev-tooling]
status: active
file_locks: []
shared_changes: false
batch_id: T003641
parent_feature: null
depends_on_plans: []
---

# batch-plan-tooling-fixes — Implementation Plan

_Ticket: Batch T003641 — T003619, T003621, T003623, T003381 (4 Tickets, ein Branch)_

## File Structure

```
scripts/plan-touched-files.sh                                  (p1)
tests/spec/software-factory/stage-plan-touched-files.bats      (p1)
scripts/plan-qa-check.sh                                       (p2)
tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats        (p2)
scripts/plan-intel.sh                                          (p3)
tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats          (p3)
openspec/changes/batch-plan-tooling-fixes/specs/dev-flow-plan.md          (p4)
openspec/changes/batch-plan-tooling-fixes/specs/quickwins-script-fixes.md (p4)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-touched-files.md` | impl | `scripts/plan-touched-files.sh`, `tests/spec/software-factory/stage-plan-touched-files.bats` | |
| p2 | `tasks.d/p2-qa-check.md` | impl | `scripts/plan-qa-check.sh`, `tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats` | |
| p3 | `tasks.d/p3-intel-targets.md` | impl | `scripts/plan-intel.sh`, `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats` | |
| p4 | `tasks.d/p4-tests.md` | tests | `openspec/changes/batch-plan-tooling-fixes/specs/dev-flow-plan.md`, `openspec/changes/batch-plan-tooling-fixes/specs/quickwins-script-fixes.md` | p1, p2, p3 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die BATS-Tests in p1..p3 reproduzieren die vier
      Defekte. Sie MÜSSEN auf dem aktuellen Branch fehlschlagen (p1: leere
      File-Structure + Branch-Diff → stdout darf nicht gefüllt werden; p2: Plan-Datei
      nach FAIL→PASS-Lauf byte-identisch, Kriterium-5-Determinismus; p3:
      `--target-files a b` erzeugt impact_files für alle Pfade).

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/software-factory/stage-plan-touched-files.bats \
  tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats \
  tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats
# expected: FAIL (red — die Fixes p1..p3 sind nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Implementiere die Fixes p1..p3. Die BATS-Tests
      aus dem vorherigen Schritt müssen nun grün sein.

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Child-Ticket-Zuordnung

- T003619 → p1 (plan-touched-files: Branch-Diff nur als Ergänzung, nie als Quelle)
- T003621 → p2 (plan-qa-check: kein Boilerplate-Anhang bei grünem Ergebnis)
- T003381 → p2 (plan-qa-check: Kriterium 5 deterministisch wie plan-lint STRUCT3)
- T003623 → p3 (plan-intel: mehrere --target-files)

---
id: P3
role: tests
ticket: T900999
depends_on: [P1, P2, P4]
target_files:
  - scripts/plan-lint.sh
  - tests/spec/plan-lifecycle.bats
---

# P3 Delete-Guard-Tests (fail-closed)

Ziel: BATS-Guard — kein Plan-Delete ohne verifizierten DB-Record
(`tickets.ticket_plans`). `scripts/plan-lint.sh` nur lesend als Referenz,
NICHT aendern (schreibt eh nie).

## Steps

1. `scripts/plan-lint.sh` lesen: Disjunktheits-Regeln (`partial_targets`,
   `_plan_scope_violations`) verstehen, nichts daran aendern.
2. Failing-Test zuerst: neue Datei `tests/spec/plan-lifecycle.bats`
   anlegen mit Test "delete ohne DB-Record schlaegt fehl"; auf Alt-Stand
   laufen lassen und expected FAIL dokumentieren:
   `bash tests/runner.sh tests/spec/plan-lifecycle.bats` (Fallback: `bats`).
3. Guard-Tests ausbauen (fail-closed): Fall A ohne Record -> Delete
   verweigert (exit != 0); Fall B mit verifiziertem Record -> Delete
   erlaubt; Fall C Record unverifiziert/ungueltig -> Delete verweigert.
4. GREEN zeigen: Suite erneut laufen lassen, alle Tests gruen:
   `bash tests/runner.sh tests/spec/plan-lifecycle.bats`.
5. Disjunktheit pruefen: nur die zwei Target-Files beruehrt
   (`git status --porcelain`); keine Impl-Dateien anfassen.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/spec-pipeline-lifecycle/tasks.md` PASS (0 hard)
- Neue Suite `tests/spec/plan-lifecycle.bats` gruen (inkl. dokumentiertem FAIL-vorher / GREEN-nachher)

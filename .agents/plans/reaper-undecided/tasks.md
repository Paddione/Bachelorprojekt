---
title: "reaper-undecided — Implementation Plan"
ticket_id: T900787
domains: [ci-cd, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# reaper-undecided — Implementation Plan

`branch-reaper.sh --sweep` verbucht Signal-Ausfaelle still als KEEP: ein gescheiterter Fetch
bleibt unsichtbar, ein fehlender Tracking-Ref landet als falsche T900096-Begruendung, und die
Schlusszeile meldet "keine verwaisten Branches", obwohl Kandidaten nur nicht pruefbar waren.
Der Exit-Code bleibt 0 (Vertrag T003074/T007032), die Ausgabe wird ehrlich.

_Ticket: T900787_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/branch-reaper.sh` | 500 | 300 |
| `tests/spec/ci-cd/branch-reaper-undecided.bats` | neu | n/a (S1-ungated) |

Budget geprueft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget scripts/branch-reaper.sh`.

<!-- vitest: kein neuer Test noetig, weil keine Datei unter components/website/src geaendert wird -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-reaper.md | impl | scripts/branch-reaper.sh | | 27b-local | 32000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/ci-cd/branch-reaper-undecided.bats | p1 | 4b-local | 8000 |

## Task: Failing Test bestaetigen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-undecided.bats
```

expected: FAIL (Tests 2 und 3 vor p1).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

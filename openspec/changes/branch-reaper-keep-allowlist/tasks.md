---
title: "branch-reaper-keep-allowlist — Implementation Plan"
ticket_id: T007032
domains: [dev-tooling, ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# branch-reaper-keep-allowlist — Implementation Plan

_Ticket: T007032 — branch-reaper: KEEP bei gemergten Branches — Allowlist deckt specs/scripts/tests nicht ab_

## File Structure

```
scripts/branch-reaper.sh                                                   (p1 — MERGED-PR-Positiv-Signal; Ist 310 - Baseline 0 -> Budget 490)
tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats                       (p2 — BATS-Positiv-Signal-Tests; NEU)
openspec/changes/branch-reaper-keep-allowlist/specs/ci-cd.md               (p2 — Delta-Spec: Merged PRs Are a Positive Reaping Signal; NEU)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | `tasks.d/p1-implement.md` | impl | `scripts/branch-reaper.sh` | |
| p2 | `tasks.d/p2-tests.md` | tests | `tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats`, `openspec/changes/branch-reaper-keep-allowlist/specs/ci-cd.md` | p1 |

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Der BATS-Test reproduziert den Befund aus T007032:
      Branch mit Ticket-ID, done-Ticket und eigenem MERGED-PR (headRefOid == Remote-Tip)
      wird trotz Abweichung ausserhalb der ALLOWLIST nicht gereapt (Kernfall: gemergter
      Branch mit `scripts/echt.sh`-Änderung landet in 'KEEP ... abweichende Datei ausserhalb
      der Allowlist'). Die Positiv-Anker (Tests 1, 5, 10) MÜSSEN auf dem aktuellen Branch
      fehlschlagen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats
# expected: FAIL (red — die Positiv-Anker scheitern am fehlenden MERGED-PR-Signal)
```

- [x] **Fix-Step (GREEN).** Implementiere p1 (Positiv-Signale im branch-reaper). Der
      BATS-Test aus dem vorherigen Schritt muss nun grün sein (9/9), die bestehenden
      Reaper-Tests bleiben grün (Regression).

- [ ] **Final Verification.** Drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

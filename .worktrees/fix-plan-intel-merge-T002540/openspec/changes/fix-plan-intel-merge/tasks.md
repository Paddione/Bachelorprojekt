---
title: "plan-intel --out Merge-Fix"
ticket_id: T002540
domains: [scripts]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-intel.sh --out Merge-Fix

_Ticket: T002540_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/plan-intel.sh` | 215 | — |
| `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats` | — | neu |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| 1 | tasks.d/p1-fix-line46.md | fix | scripts/plan-intel.sh | — |
| 2 | tasks.d/p2-fix-line183-bats.md | fix | scripts/plan-intel.sh, tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats | 1 |

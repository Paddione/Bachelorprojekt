---
title: Spec-Pipeline Lifecycle Receipt Delete
ticket_id: T900999
domains: plans
status: staged
---

# Implementation Plan

## Partials

| id | file | role | target_files | depends_on |
| P1 | tasks.d/p1-finalize-receipt.md | impl | scripts/devflow-post-merge-finalize.sh |  |
| P2 | tasks.d/p2-cleanup-sweep.md | impl | scripts/branch-reaper.sh |  |
| P4 | tasks.d/p4-staged-superseded-rule.md | impl | scripts/ticket.sh | P1 |
| P5 | tasks.d/p5-lifecycle-doctrine.md | impl | .opencode/skills/references/plan-quality-gates.md |  |
| P3 | tasks.d/p3-delete-guard-tests.md | tests | scripts/plan-lint.sh, tests/spec/plan-lifecycle.bats | P1, P2, P4 |

## File Structure

- `.agents/plans/spec-pipeline-lifecycle/` — proposal.md, tasks.md, tasks.d/, intel.json
- P1–P5 beruehren einander nicht (Kollisions-Guard).

## Verify

- `bash scripts/plan-lint.sh .agents/plans/spec-pipeline-lifecycle/tasks.md` PASS (0 hard)
- `task test:changed` gruen
- `task freshness:regenerate` -> Artefakte committen -> `task freshness:check` gruen

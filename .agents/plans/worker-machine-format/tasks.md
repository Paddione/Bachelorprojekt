---
title: Worker-Track + Maschinen-Format
ticket_id: T901014
domains: [agents]
status: draft
---

# Implementation Plan

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-worker-track.md | impl | scripts/llm/plan-runner/workers.mjs, scripts/llm/plan-runner.mjs |  |
| P2 | tasks.d/p2-machine-format.md | impl | scripts/llm/plan-runner/plan.mjs |  |
| P3 | tasks.d/p3-validation.md | impl | scripts/plan-lint.sh |  |
| P4 | tasks.d/p4-track-tests.md | tests | tests/spec/llm-local-dev/ | P1, P2, P3 |

## File Structure

- `.agents/plans/worker-machine-format/tasks.md` — dieser Index
- `.agents/plans/worker-machine-format/tasks.d/p1-worker-track.md`
- `.agents/plans/worker-machine-format/tasks.d/p2-machine-format.md`
- `.agents/plans/worker-machine-format/tasks.d/p3-validation.md`
- `.agents/plans/worker-machine-format/tasks.d/p4-track-tests.md`
- `.agents/plans/worker-machine-format/proposal.md`
- `.agents/plans/worker-machine-format/intel.json`

## Verify

- `bash scripts/plan-lint.sh .agents/plans/worker-machine-format/tasks.md` → PASS
- `task test:changed` → exit 0
- `task freshness:regenerate` → Artefakte committen → `task freshness:check` → grün

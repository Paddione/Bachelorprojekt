---
title: "plan-runner — Implementation Plan"
ticket_id: T900504
domains: [llm-local-dev]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-runner — Implementation Plan

_Ticket: T900504_ · Design: `openspec/changes/plan-runner/design.md` · Voraussetzung: Branch
`chore/llm-bench-orchestration-T900480` ist auf `main` (Unit `scripts/llm/qwen38-gsq-iq2s.service`,
`scripts/llm/bench-orchestration.mjs`, Messprotokolle).

## File Structure

```
scripts/llm/plan-runner/plan.mjs                                   (neu, p1)
scripts/llm/plan-runner/workers.mjs                                (neu, p2)
scripts/llm/plan-runner.mjs                                        (neu, p3)
docs/runbooks/plan-runner.md                                       (neu, p3)
scripts/llm/qwen35-mtp.service                                     (geaendert, p4)
.opencode/agent-models.jsonc                                       (geaendert, p4)
scripts/llm/measurements/2026-09-27-qwen35-4b-slots.md             (neu, p4)
tests/spec/llm-local-dev/plan-runner.bats                          (neu, p5)
tests/spec/llm-local-dev/fixtures/plan-runner-fake-orch.mjs        (neu, p5)
tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh     (neu, p5)
components/website/src/data/test-inventory.json                    (regeneriert, p5)
```

S1: alle Skripte sind neu; `.mjs`-Limit laut `docs/code-quality/gates.yaml` 800 Zeilen. Zielgroessen:
`plan.mjs` unter 250, `workers.mjs` unter 250, `plan-runner.mjs` unter 450 Zeilen. Waechst
`plan-runner.mjs` ueber 600 Zeilen, wird der Tool-Dispatch in `scripts/llm/plan-runner/tools.mjs`
extrahiert (split), statt Zeilen zusammenzuziehen. `scripts/llm/qwen35-mtp.service` und
`.opencode/agent-models.jsonc` sind nicht gebaselined und aendern sich nur um wenige Zeilen.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-plan-model.md | impl | scripts/llm/plan-runner/plan.mjs | |
| p2 | tasks.d/p2-worker-pool.md | impl | scripts/llm/plan-runner/workers.mjs | |
| p3 | tasks.d/p3-orchestrator-loop.md | impl | scripts/llm/plan-runner.mjs, docs/runbooks/plan-runner.md | p1,p2 |
| p4 | tasks.d/p4-worker-slots-serving.md | impl | scripts/llm/qwen35-mtp.service, .opencode/agent-models.jsonc, scripts/llm/measurements/2026-09-27-qwen35-4b-slots.md | |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/llm-local-dev/plan-runner.bats, tests/spec/llm-local-dev/fixtures/plan-runner-fake-orch.mjs, tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh, components/website/src/data/test-inventory.json | p1,p2,p3,p4 |

## Verify (RED → GREEN)

Der Failing-Test-Step steht in `tasks.d/p5-tests.md` (Task 5.1, `expected: FAIL`).

- [ ] **Task V: Finale Verifikation**
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/plan-runner.bats
  node --check scripts/llm/plan-runner.mjs scripts/llm/plan-runner/plan.mjs scripts/llm/plan-runner/workers.mjs
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
  Erwartet: alle BATS-Tests gruen, `freshness:check` ohne S1-/S4-Verletzung.

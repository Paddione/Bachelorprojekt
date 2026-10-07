---
title: "plan-runner-opencode-v2 — Implementation Plan"
ticket_id: T900729
domains: [llm-local-dev, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-runner-opencode-v2 — Implementation Plan

plan-runner und zwei weitere Aufrufer starten `opencode run` mit dem in v2 entfernten `--dir`, und der
plan-runner verliert das Agent-Modell. Ursachen, Belege, Entscheidungen: `design.md`.

_Ticket: T900729_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/llm/plan-runner/workers.mjs` | 125 | 675 |
| `scripts/glimmer-worker-mcp/server.mjs` | 294 | 506 |
| `scripts/llm/agent-bench/lib/roles/code-worker.mjs` | 56 | 744 |
| `tests/spec/llm-local-dev/plan-runner.bats` | 241 | n/a (S1-ungated) |
| `tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh` | 23 | n/a (S1-ungated) |

Budgets geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <pfad>`.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-runner.md | impl | scripts/llm/plan-runner/workers.mjs | |
| p2 | tasks.d/p2-callers.md | impl | scripts/glimmer-worker-mcp/server.mjs, scripts/llm/agent-bench/lib/roles/code-worker.mjs | |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/llm-local-dev/plan-runner.bats, tests/spec/llm-local-dev/fixtures/plan-runner-fake-opencode.sh | p1, p2 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/llm-local-dev/plan-runner.bats
```

expected: FAIL (vor p1).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

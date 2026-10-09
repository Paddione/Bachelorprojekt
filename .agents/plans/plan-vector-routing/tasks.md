---
title: "plan-vector-routing — staged plans as K1 doctype with dispatch recall"
ticket_id: T901542
domains: [llm-local-dev, brain]
status: staged
file_locks: [scripts/llm/plan-stage-index.mjs, scripts/llm/plan-runner/workers.mjs, scripts/llm/plan-runner/plan.mjs, scripts/vda/ticket/stage-plan.sh]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-vector-routing — Implementation Plan

Muse plant, gpt-oss/4B führen aus: gestagte Pläne werden zur Stage-Zeit als Doctype `plan_partial` in die bestehende K1-Collection `specs_plans` indexiert (pre-merge, da K1 nur auf main-Push indexiert), und der plan-runner reichert Worker-Prompts per `task context:retrieve` mit top-k Partial-Snippets an (K1→K3-Recall). Kein paralleler Vektor-Store, kein neuer Service: Routing bleibt eine `decideTrack`-Erweiterung in `scripts/llm/plan-runner/workers.mjs`. Der 4B-Pool auf :8080 bleibt unberührt; nur :1919 passt ein schweres Modell (verdrängt Qwen3.8-27B — separates Deploy-Ticket, nicht hier).

_Ticket: T901542_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/llm/plan-stage-index.mjs` | 0 | neu |
| `scripts/vda/ticket/stage-plan.sh` | 175 | 625 |
| `scripts/llm/plan-runner/workers.mjs` | 170 | 630 |
| `scripts/llm/plan-runner/plan.mjs` | 137 | 663 |
| `tests/spec/llm-local-dev/plan-vector-routing.bats` | 0 | neu (S1-ungated) |
| `tests/spec/llm-local-dev/fixtures/plan-vector-routing-fake-retrieve.sh` | 0 | neu (S1-ungated) |

Budgets geprüft mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <pfad>`.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-stage-index.md | impl | scripts/llm/plan-stage-index.mjs, scripts/vda/ticket/stage-plan.sh | |
| p2 | tasks.d/p2-dispatch-recall.md | impl | scripts/llm/plan-runner/workers.mjs, scripts/llm/plan-runner/plan.mjs | p1 |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/llm-local-dev/plan-vector-routing.bats, tests/spec/llm-local-dev/fixtures/plan-vector-routing-fake-retrieve.sh | p1, p2 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/llm-local-dev/plan-vector-routing.bats
```

expected: FAIL (vor p1: Skript und Tests fehlen).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```

---
title: "agent-bench — Implementation Plan"
ticket_id: T900561
domains: [llm-local-dev, unsloth-eval-harness]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-bench — Implementation Plan

_Ticket: T900561_ · Design: `openspec/changes/agent-bench/design.md` · Spec: `openspec/changes/agent-bench/specs/agent-bench.md`

Voraussetzungen auf dem GPU-Host (bereits erfüllt, 2026-09-27): vLLM 0.30.0 in `~/opt/vllm-nvfp4`,
Modell `unsloth/gemma-4-12b-it-NVFP4` unter `~/models/gemma-4-12b-it-NVFP4`, `plan-runner.mjs` auf `main`.

## File Structure

```
scripts/llm/agent-bench/lib/cases.mjs                     (neu, p1)
scripts/llm/agent-bench/lib/scoring.mjs                   (neu, p1)
scripts/llm/agent-bench/scoring.json                      (neu, p1)
scripts/llm/agent-bench/lib/recorder.mjs                  (neu, p2)
scripts/llm/agent-bench/lib/loadouts.mjs                  (neu, p3)
scripts/llm/agent-bench/models.json                       (neu, p3)
scripts/llm/agent-bench/vllm-kernel-check.py              (neu, p3)
scripts/llm/agent-bench/lib/matrix.mjs                    (neu, p4)
scripts/llm/agent-bench/bench.mjs                         (neu, p4)
scripts/llm/agent-bench/lib/roles.mjs                     (neu, p5)
scripts/llm/agent-bench/lib/report.mjs                    (neu, p6)
scripts/llm/agent-bench/lib/corpus.mjs                    (neu, p6)
scripts/llm/agent-bench/cases/**                          (neu, p7)
docs/runbooks/agent-bench.md                              (neu, p8)
docs/finetune/finetune-readiness.md                       (neu, p8)
scripts/llm/measurements/agent-bench-gemma12-nvfp4.md     (neu, p8)
tests/spec/agent-bench/*.bats                             (neu, p9)
tests/spec/agent-bench/fixtures/**                        (neu, p9)
components/website/src/data/test-inventory.json           (regeneriert, p9)
```

S1: alle Dateien sind neu, keine ist gebaselined. Limits laut `docs/code-quality/gates.yaml`: `.mjs` 800,
`.py` 800. Zielgrößen: jedes `lib/*.mjs` unter 400 Zeilen, `bench.mjs` unter 300. Wächst `roles.mjs`
über 600 Zeilen, wird je Rolle ein Modul unter `lib/roles/` extrahiert (split), statt Zeilen
zusammenzuziehen. S4: `bench.mjs` und `vllm-kernel-check.py` werden aus `docs/runbooks/agent-bench.md`
referenziert, `lib/*.mjs` aus `bench.mjs`.

Konventionen für alle Partials: Node 22, nur Standardbibliothek (wie `scripts/llm/plan-runner.mjs`),
ESM, Konfiguration als JSON. Laufdaten liegen außerhalb des Repos unter `$AGENT_BENCH_RUNS`
(Default `~/agent-bench-runs`).

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-cases-scoring.md | impl | scripts/llm/agent-bench/lib/cases.mjs, scripts/llm/agent-bench/lib/scoring.mjs, scripts/llm/agent-bench/scoring.json | | 27b-local | 60000 |
| p2 | tasks.d/p2-recorder.md | impl | scripts/llm/agent-bench/lib/recorder.mjs | | 27b-local | 40000 |
| p3 | tasks.d/p3-loadouts.md | impl | scripts/llm/agent-bench/lib/loadouts.mjs, scripts/llm/agent-bench/models.json, scripts/llm/agent-bench/vllm-kernel-check.py | | cloud | 80000 |
| p4 | tasks.d/p4-matrix-cli.md | impl | scripts/llm/agent-bench/lib/matrix.mjs, scripts/llm/agent-bench/bench.mjs | p1,p2,p3 | cloud | 90000 |
| p5 | tasks.d/p5-roles.md | impl | scripts/llm/agent-bench/lib/roles.mjs | p1,p2 | cloud | 90000 |
| p6 | tasks.d/p6-report-corpus.md | impl | scripts/llm/agent-bench/lib/report.mjs, scripts/llm/agent-bench/lib/corpus.mjs | p1 | 27b-local | 60000 |
| p7 | tasks.d/p7-cases.md | impl | scripts/llm/agent-bench/cases/ | p1 | cloud | 120000 |
| p8 | tasks.d/p8-docs-measurement.md | docs | docs/runbooks/agent-bench.md, docs/finetune/finetune-readiness.md, scripts/llm/measurements/agent-bench-gemma12-nvfp4.md | p4,p5,p6,p7 | cloud | 80000 |
| p9 | tasks.d/p9-tests.md | tests | tests/spec/agent-bench/, components/website/src/data/test-inventory.json | p1,p2,p3,p4,p5,p6,p7 | cloud | 100000 |

Reihenfolge der Umsetzung: p1, p2, p3 parallel → p5, p6, p7 → p4 → p9 → p8 (p8 enthält die erste
echte Messung auf dem GPU-Host und läuft zuletzt, nachdem die Tests grün sind).

## Verify (RED → GREEN)

Der Failing-Test-Step steht in `tasks.d/p9-tests.md` (Task 9.1, `expected: FAIL`).

- [x] **Task V: Finale Verifikation**
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-bench/
  node --check scripts/llm/agent-bench/bench.mjs scripts/llm/agent-bench/lib/*.mjs
  bash scripts/openspec.sh validate
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
  Erwartet: alle BATS-Tests grün, `freshness:check` ohne S1-/S4-Verletzung, `openspec validate: OK`.

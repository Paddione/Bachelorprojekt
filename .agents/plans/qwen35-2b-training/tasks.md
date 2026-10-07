---
title: Qwen3.5-2B worker training set
ticket_id: T900978
domains: [agents]
status: draft
---

# Implementation Plan

## Partials

| id | file | role | target_files | depends_on |
| P1 | tasks.d/p1-dataset-slice.md | impl | .agents/training/generate_dataset.py, .agents/training/dataset_stats.json |  |
| P2 | tasks.d/p2-train-config.md | impl | .agents/training/train_5070ti.py, .agents/training/TRAINING_PLAN.md | P1 |
| P3 | tasks.d/p3-eval.md | impl | .agents/training/eval.py | P2 |
| P4 | tasks.d/p4-export.md | impl | .agents/training/export_model.py | P3 |
| P5 | tasks.d/p5-training-tests.md | tests | tests/spec/llm-local-dev/ | P1, P2, P3, P4 |

## File Structure

- `.agents/plans/qwen35-2b-training/proposal.md` — WARUM + WAS (Triage-Entscheidungen).
- `.agents/plans/qwen35-2b-training/tasks.md` — Partial-Manifest (dieser Index).
- `.agents/plans/qwen35-2b-training/tasks.d/p1-dataset-slice.md` — 2B-Slice aus 4B-Set.
- `.agents/plans/qwen35-2b-training/tasks.d/p2-train-config.md` — 2B-Config für 5070Ti.
- `.agents/plans/qwen35-2b-training/tasks.d/p3-eval.md` — Eval + Acceptance-Thresholds.
- `.agents/plans/qwen35-2b-training/tasks.d/p4-export.md` — Export + llama.cpp-Verify.
- `.agents/plans/qwen35-2b-training/tasks.d/p5-training-tests.md` — Testabdeckung je Track.
- `.agents/plans/qwen35-2b-training/intel.json` — Plan Intel Bundle (generiert).

## Verify

- `bash scripts/plan-lint.sh .agents/plans/qwen35-2b-training/tasks.md` → PASS (0 hard).
- `task test:changed` → exit 0.
- `task freshness:regenerate` → Artefakte committen → `task freshness:check` → exit 0.

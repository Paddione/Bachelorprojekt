---
title: 4B instruct worker training set — run, eval, export, deploy
ticket_id: T900977
domains: [llm, training]
status: implemented
---

# Implementation Plan

## Partials

| id | file | role | target_files | depends_on |
| P1 | tasks.d/p1-upstream-verify.md | impl | .agents/training/TRAINING_PLAN.md |  |
| P2 | tasks.d/p2-train-run.md | impl | .agents/training/train_5070ti.py | P1 |
| P3 | tasks.d/p3-eval-metrics.md | impl | .agents/training/eval.py | P2 |
| P4 | tasks.d/p4-export-verify.md | impl | .agents/training/export_model.py | P3 |
| P5 | tasks.d/p5-training-tests.md | tests | tests/spec/llm-local-dev/ | P1, P2, P3, P4 |

## File Structure

- `.agents/plans/qwen35-4b-training/proposal.md` — Problem, Ziel und Lösungsansatz.
- `.agents/plans/qwen35-4b-training/tasks.md` — Partial-Manifest (dieser Index).
- `.agents/plans/qwen35-4b-training/tasks.d/p1-upstream-verify.md` — Upstream HF-Checkpoint & Preflight.
- `.agents/plans/qwen35-4b-training/tasks.d/p2-train-run.md` — 5070 Ti LoRA-Trainingslauf.
- `.agents/plans/qwen35-4b-training/tasks.d/p3-eval-metrics.md` — Base-vs-Tuned Evaluation & Metriken.
- `.agents/plans/qwen35-4b-training/tasks.d/p4-export-verify.md` — GGUF Export & Issue #24737 Guard.
- `.agents/plans/qwen35-4b-training/tasks.d/p5-training-tests.md` — Testabdeckung, BATS & Verification.

## Verify

- `bash scripts/plan-lint.sh .agents/plans/qwen35-4b-training/tasks.md` → PASS (0 hard).
- `task test:changed` → exit 0.
- `task freshness:regenerate` → `task freshness:check` → exit 0.

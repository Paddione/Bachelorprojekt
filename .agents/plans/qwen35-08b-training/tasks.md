---
title: 0.8B instruct worker training set — viability-gated slice, run, eval
ticket_id: T900979
domains: [llm, training]
status: staged
---

# qwen35-08b-training — Implementation Plan

## File Structure

- `.agents/plans/qwen35-08b-training/proposal.md` — Problem, Ziel und Lösungsansatz.
- `.agents/plans/qwen35-08b-training/tasks.md` — Partial-Manifest (dieser Index).
- `.agents/plans/qwen35-08b-training/tasks.d/p1-dataset-slice.md` — 0.8B Minimal Slice Definition & Stats.
- `.agents/plans/qwen35-08b-training/tasks.d/p2-train-config.md` — 0.8B Training-Config & Upstream-Dokumentation.
- `.agents/plans/qwen35-08b-training/tasks.d/p3-eval-viability.md` — Eval mit hartem Viability-Gate.
- `.agents/plans/qwen35-08b-training/tasks.d/p4-export-verify.md` — GGUF Export & 24-Block Count Guard (#24737).
- `.agents/plans/qwen35-08b-training/tasks.d/p5-training-tests.md` — Testabdeckung, BATS & Verifikation.
- `.agents/plans/qwen35-08b-training/intel.json` — Plan Intel Bundle (generiert).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| P1 | tasks.d/p1-dataset-slice.md | impl | .agents/training/generate_dataset.py, .agents/training/dataset_stats.json |  |
| P2 | tasks.d/p2-train-config.md | impl | .agents/training/train_5070ti.py, .agents/training/TRAINING_PLAN.md | P1 |
| P3 | tasks.d/p3-eval-viability.md | impl | .agents/training/eval.py | P2 |
| P4 | tasks.d/p4-export-verify.md | impl | .agents/training/export_model.py | P3 |
| P5 | tasks.d/p5-training-tests.md | tests | tests/spec/llm-local-dev/ | P1, P2, P3, P4 |

## Root Cause & Kontext

T900979 adressiert die kleinste Modellklasse (0.8B) in der Modell-Leiter:
- Einsatzzweck: Nur triviale mechanische Partials (Renames, Lockfile-Bumps, reine Doc-Syncs).
- Viability-Gate: Besteht das Modell die Eval nicht, bleibt es von der Leiter; keine Agent-IDs vor grüner Eval.
- Upstream: Kanonischer Checkpoint ist `unsloth/Qwen3.5-0.8B` (24 Layers, Text-Config).
- Export-Schutz: 24 Transformer-Blocks (ggü. 32 bei 2B/4B), Absicherung gegen llama.cpp #24737.

## Task 1 — P1 bis P4 umsetzen

Umsetzung der Partials P1–P4 gemäß den Spezifikationen in `tasks.d/`.

## Task 2 — P5 Testabnahme

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/qwen35-08b-training.bats
```
Vor der Implementierung: expected FAIL (RED-Phase).
Nach der Implementierung: PASS (GREEN-Phase).

## Task 3 — Verify

```bash
task test:changed; task freshness:regenerate; task freshness:check; 
```

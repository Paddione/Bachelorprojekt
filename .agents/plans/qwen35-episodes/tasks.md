---
title: Qwen teacher episodes and validated dataset export
ticket_id: T900930
domains: [ml]
status: staged
---
# qwen35-episodes — Implementation Plan

## File Structure
- `ml/qwen35-agents/colab/config.py`: CPU budget, planner schema and resume guards.
- `ml/qwen35-agents/colab/Qwen35_9B_Planner_Colab.ipynb`: downloadable Colab-only 9B notebook.
- `ml/qwen35-agents/colab/build_notebook.py`: reproducible notebook source.
- `ml/qwen35-agents/tests/test_colab.py`: budget, schema, reasoning, resume and notebook checks.
- `ml/qwen35-agents/pipeline/__init__.py`: pipeline package.
- `ml/qwen35-agents/pipeline/scenarios.py`: versioned scenario definitions and templates.
- `ml/qwen35-agents/pipeline/capture.py`: real OpenCode JSON event capture and normalization.
- `ml/qwen35-agents/pipeline/preflight.py`: CPU format, JSON schema, manifest and tokenizer gates.
- `ml/qwen35-agents/schema/episodes.py`: observed decision and source metadata.
- `ml/qwen35-agents/eval/role_metrics.py`: score observed selections and reviewed completions.
- `ml/qwen35-agents/pipeline/export.py`: deterministic family splits and QC-gated JSONL.
- `ml/qwen35-agents/schema/validate.py`: canonical transcript fingerprints and evidence validation.
- `ml/qwen35-agents/tests/test_pipeline.py`: focused regression coverage.
- `ml/qwen35-agents/README.md`: reproducible workflow and safety boundaries.

## Zweck und Design
Szenarien fuer vier Rollen erstellen, echte Teacher-Ausgaben inklusive Fehlern speichern und nur validierte Episoden reproduzierbar exportieren. Keine GPU-Jobs oder Modellwechsel. OpenCode wird explizit in einem isolierten Worktree gestartet; Rohdaten bleiben als Provenance erhalten. Szenariofamilien bleiben vollstaendig in einem Split. Erfolg setzt erfolgreiche abgeschlossene Tool-Evidenz voraus; Prozessfehler werden bewahrt.

## Budgets
Python-Schwelle 800 Zeilen, keine Baseline fuer diese Dateien. Bestehender Validator 100 Zeilen; Budget 700. Neue Module bleiben jeweils unter 400 Zeilen. README bleibt klein; keine statische Markdown-S1-Schwelle. Graph/LSP nicht erreichbar: gezielte direkte Source-Reads als Evidenz, keine Vollstaendigkeitsbehauptung.

## Task 1 — Regression tests and scenarios
- [x] Add unittest regressions for scenario definitions, real tool evidence, failed runs, malformed transcripts, arguments-aware dedupe, family leakage and refusal of invalid export.
- [x] Run `uv run --project ml/qwen35-agents --with pytest python -m pytest ml/qwen35-agents/tests` (expected: FAIL before pipeline exists).
- [x] Implement validated scenario generation with role requirements and success/failure cases.

## Task 2 — Capture and export
- [x] Normalize OpenCode JSON events, persist source records, timestamps, command exit codes and session provenance without inventing tool evidence.
- [x] Implement QC-gated deterministic JSONL exports with family-based splitting and manifest hashes; refuse overwrite or invalid input.
- [x] Strengthen canonical dedupe and tool-evidence QC. Document human review, read-only smoke and explicit run boundaries.

## Task 3 — Hugging Face preparation
- [x] Convert exported function.arguments into dictionaries, validate schemas in `ml/qwen35-agents/pipeline/preflight.py`, and preserve heterogeneous JSON using datasets Json features.
- [x] Document role filtering without resplitting, local tokenizer context/mask preflight and private future trace sharing; no GPU jobs submitted.

## Task 4 — Colab planner continuation
- [x] Write focused regression tests in `ml/qwen35-agents/tests/test_colab.py`; run `uv run --project ml/qwen35-agents --with pytest python -m pytest ml/qwen35-agents/tests/test_colab.py` (expected: FAIL before helper exists).
- [x] Implement `ml/qwen35-agents/colab/config.py`, with displayed Colab rate, 200-credit ceiling/reserve, reviewed planner schema/reasoning gates and immutable resume identity.
- [x] Generate `ml/qwen35-agents/colab/Qwen35_9B_Planner_Colab.ipynb` from `ml/qwen35-agents/colab/build_notebook.py`: bf16 LoRA9B only, local Trackio, Drive persistence and short pilot; no paid jobs run here.
- [x] Preserve actual recorded reasoning in capture; no synthesized rationales. Require 75 percent reasoning examples for the reasoning planner.

## Task 5 — Verify and deliver
- [x] Run focused unittest suite and CLI smoke with real local read-only teacher when available.
- [x] Run `task test:inventory`, `task test:changed`, `task freshness:regenerate`, `task freshness:check`, and `task workspace:validate`.
- [x] Commit and push implementation; create PR with concrete validation and limitations. Parent handles review and merge; create draft PR because original ticket scope remains open.

---
title: Qwen teacher episodes and validated dataset export
ticket_id: T900930
domains: [ml]
status: staged
---
# qwen35-episodes — Implementation Plan

## File Structure
- `ml/qwen35-agents/pipeline/scenarios.py`: versioned scenario definitions and templates.
- `ml/qwen35-agents/pipeline/capture.py`: real OpenCode JSON event capture and normalization.
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

## Task 3 — Verify and deliver
- [x] Run focused unittest suite and CLI smoke with real local read-only teacher when available.
- [x] Run `task test:inventory`, `task test:changed`, `task freshness:regenerate`, `task freshness:check`, and `task workspace:validate`.
- [x] Commit and push implementation; create PR with concrete validation and limitations. Parent handles review and merge; create draft PR because original ticket scope remains open.

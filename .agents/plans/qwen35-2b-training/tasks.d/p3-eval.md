---
id: P3
role: impl
ticket: T900978
depends_on: P2
target_files:
  - .agents/training/eval.py
---

# P3 — 2B-Eval mit Acceptance-Thresholds

## Ziel

`.agents/training/eval.py` von 4B-MTP auf `unsloth/Qwen3.5-2B`
umstellen und harte Acceptance-Thresholds einbauen. Ladder-Regel:
keine Agent-ID-Vergabe vor gruener Eval auf dem P1-Val-Split.

## Acceptance-Thresholds

- `command-match >= 0.70` auf vollem Val-Split (`--mode val`, ohne `--limit`).
- `empty-output-rate == 0` und `think-leak-rate == 0` (kein `<think>` im Output).
- `compare`-Stichprobe (`--limit 8`): tuned nicht schlechter als base.

## Concrete-Steps

1. `BASE_MODEL` auf `unsloth/Qwen3.5-2B`, `ADAPTER_DIR` auf
   `qwen35_2b_bp_lora`, `SEQ_LEN`/`MAX_NEW_TOKENS` aus P2-Train-Config uebernehmen.
2. Val-Pfad auf P1-Slice-Val-Datei (`dataset_2b_val.jsonl`) umstellen,
   Sampling-Defaults (temp 0.8, top_k 40, top_p 0.95, min_p 0.05) behalten.
3. `run_val` um harte Scores erweitern: command-match, empty-output-rate,
   think-leak-rate; Summary-Zeile plus Exit-Code `!= 0` bei Threshold-Verletzung.
4. `run_compare` schreibt base/tuned-Paare plus Score-Delta nach `eval_2b_results.json`.
5. Trockenlauf ohne GPU: Fixture mit 3 Val-Zeilen, `_extract_commands`
   und Scoring-Funktionen direkt aufrufen, Threshold-Logik (pass/fail) pruefen.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/qwen35-2b-training/tasks.md` -> PASS.
- Eval-Trockenlauf auf Fixtures gruen (Threshold pass/fail belegt).

## Disjunktheit

- P1: Dataset-Slice/Stats. P2: Train-Config/Plan. P4: Export/GGUF.
- P5: Tests unter `tests/spec/llm-local-dev/`. Diese Datei beruehrt nur `eval.py`.
- Fremde `ml/`-Dirs werden nur lesend zur Kenntnis genommen, nie angefasst.

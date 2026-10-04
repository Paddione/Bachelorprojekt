---
id: P5
role: tests
ticket: T900978
depends_on: [P1, P2, P3, P4]
target_files:
  - tests/spec/llm-local-dev/
---

# P5: Training-Tests (Slice/Config/Eval/Export)

## Ziel
Testabdeckung fuer P1-Slice (Filter/Dedup/Val-Split/Stats),
P2-Trainingsconfig (LoRA r=32, 200 Steps, 5070Ti-Pfade),
P3-Eval (Metriken/Thresholds) und P4-Export (GGUF-Artefakt)
auf Fixtures ohne GPU und ohne Netz.

## Concrete Steps
1. Fixture-Datensatz `tests/spec/llm-local-dev/fixtures/qwen35-2b-mini.jsonl`
   (6 Zeilen: je 2 single-file/config/boilerplate) plus
   `expected-stats.json` (counts, dedup, val-Anteil) anlegen.
2. PFLICHT-Failing-Test: neuen Test `qwen35-2b-training.bats` schreiben,
   der Slice-Filter, Config-Defaults und Eval-Threshold gegen den
   Alt-Stand prueft; zuerst `bash tests/runner.sh tests/spec/llm-local-dev/qwen35-2b-training.bats`
   (Fallback `bats tests/spec/llm-local-dev/qwen35-2b-training.bats`)
   ausfuehren und expected FAIL im Output sichern.
3. Slice-Tests: generate_dataset-Filter nur-Fallback auf Fixture anwenden,
   Dedup-Zaehler und Val-Split gegen `expected-stats.json` verifizieren.
4. Config-Test: `train_5070ti.py`-Defaults (LoRA r=32, 200 Steps,
   Basis `unsloth/Qwen3.5-2B`) per AST-/Grep-Assertion pruefen.
5. Eval-/Export-Tests: Eval-Schwellen aus P3 und Export-Artefaktpfade
   aus P4 als Stub-Lauf (Fake-Checkpoint, kein GPU/Netz) pruefen.
6. GREEN: volle Datei erneut via `tests/runner.sh` (Fallback `bats`)
   gruen laufen lassen; danach `task test:changed` happy-path halten.

## Gate
- `bash scripts/plan-lint.sh .agents/plans/qwen35-2b-training/tasks.md` -> PASS.
- `tests/spec/llm-local-dev/qwen35-2b-training.bats` gruen, `task test:changed` exit 0.

## Disjunktheit
- P1-P4 fassen keine Tests an; P5 schreibt nur unter
  `tests/spec/llm-local-dev/` (inkl. `fixtures/`).
- Fremde `ml/`-Dirs werden nie angefasst (nur lesend, kein GPU-Burn).
- Kein Commit, kein Push.

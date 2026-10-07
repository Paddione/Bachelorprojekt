---
id: P3
role: impl
ticket: T900979
depends_on:
  - P2
target_files:
  - .agents/training/eval.py
---

# P3 — 0.8B Eval mit hartem Viability-Gate (T900979)

## Ziel

Anbindung von `0.8b` in `.agents/training/eval.py` mit hartem Viability-Gate.
Ladder-Regel: Scheitert die Eval, bleibt 0.8B aus der Modell-Leiter ausgeschlossen und erhält keine Produktions-Dispatches.

## Betroffene Dateien

- `.agents/training/eval.py` (`get_eval_config` für `0.8b` und Viability-Thresholds)

## Concrete Steps

1. In `eval.py` Konfigurationszweig für `0.8b` in `get_eval_config` ergänzen:
   - `base_model`: `"unsloth/Qwen3.5-0.8B"`
   - `adapter_dir`: `HERE / "qwen35_08b_bp_lora"`
   - `val_file`: `HERE / "dataset_08b_val.jsonl"`
   - `results_file`: `HERE / "eval_08b_results.json"`
2. Harte Viability-Kriterien für 0.8B verankern:
   - `command-match >= 0.65` (auf dem mechanischen Val-Split)
   - `empty-output-rate == 0.0`
   - `think-leak-rate == 0.0`
3. Bei Verfehlen der Kriterien schlägt die Eval mit Exit-Code != 0 fehl und markiert das Modell als `VIABILITY_GATE_FAILED` (bleibt off-ladder).

## Gate

- `python3 -m py_compile .agents/training/eval.py` -> exit 0.
- Trockenlauf der Viability-Scoring-Logik mit Test-Fixtures besteht.

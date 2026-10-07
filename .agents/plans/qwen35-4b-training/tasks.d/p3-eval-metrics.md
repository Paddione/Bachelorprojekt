---
id: P3
role: impl
ticket: T900977
depends_on:
  - P2
target_files:
  - .agents/training/eval.py
---

# P3 — Base vs Tuned Evaluation & Metriken (T900977)

## Ziel

Evaluierung des trainierten LoRA-Adapters gegen das Basismodell mithilfe von `eval.py`. Messung der Genauigkeit bei Domänenfragen (Fleet-Architektur, Workflows) und Validation-Loss auf dem Val-Split (`dataset_val.jsonl`, 55 Samples).

## Betroffene Dateien

- `.agents/training/eval.py`

## Steps

1. Evaluierung im Compare-Modus durchführen:
   `python3 .agents/training/eval.py --mode compare --limit 8`
2. Vollständigen Validation-Split evaluieren:
   `python3 .agents/training/eval.py --mode val`
3. Ergebnisse und Metriken in `eval_results.json` festhalten und prüfen, ob das getunte Modell Domänenkonzepte signifikant besser beantwortet als das Basismodell.
4. Robustheitsprüfung mit `--worker-style` (Antworten ohne Assistant-System-Prompt).

## Gate

- `eval_results.json` generiert mit dokumentierten Metriken.
- Kein Regression-Drop bei Standard-Befehlen und Tool-Formaten.

## Disjunktheit

P3 bewertet die Qualität. P4 übernimmt den Export.

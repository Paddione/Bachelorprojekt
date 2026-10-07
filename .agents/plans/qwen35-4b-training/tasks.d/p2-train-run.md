---
id: P2
role: impl
ticket: T900977
depends_on:
  - P1
target_files:
  - .agents/training/train_5070ti.py
---

# P2 — LoRA Trainingslauf auf 5070 Ti (T900977)

## Ziel

Ausführung des LoRA-Finetuning-Laufs für den 4B-Instruct-Worker auf der RTX 5070 Ti unter Verwendung des Datensatzes `dataset_train.jsonl` (1054 Samples) mit den definierten Hyperparametern (bf16 LoRA r=32, alpha=32, lr=2e-4, 3 Epochen).

## Betroffene Dateien

- `.agents/training/train_5070ti.py`

## Steps

1. Umgebung prüfen: `~/.venvs/unsloth/bin/activate` und `CUDA_VISIBLE_DEVICES=1`.
2. 27B-Rail stoppen: `systemctl --user stop qwen38-gsq-iq3xxs` (sofern aktiv).
3. Trainingslauf starten:
   `python3 .agents/training/train_5070ti.py --model-size 4b-mtp --precision 16bit`
4. Trainingsfortschritt und Loss-Konvergenz überwachen; Adapter speichern unter `qwen35_4b_bp_lora/`.
5. 27B-Rail nach Abschluss bei Bedarf wieder starten: `systemctl --user start qwen38-gsq-iq3xxs`.

## Gate

- Trainingslauf beendet mit Exit 0.
- Adapter-Gewichte `adapter_config.json` und `adapter_model.safetensors` in `qwen35_4b_bp_lora/` vorhanden.

## Disjunktheit

P2 führt das Training aus. P3 übernimmt die Evaluierung.

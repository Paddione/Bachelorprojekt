---
id: P2
role: impl
ticket: T900979
depends_on:
  - P1
target_files:
  - .agents/training/train_5070ti.py
  - .agents/training/TRAINING_PLAN.md
---

# P2 — 0.8B Training-Config & Upstream-Dokumentation (T900979)

## Ziel

Konfiguration von `train_5070ti.py` für `0.8b` mit dem verifizierten Upstream-Checkpoint `unsloth/Qwen3.5-0.8B` sowie Dokumentation der 0.8B-Klasse in `TRAINING_PLAN.md`.

## Betroffene Dateien

- `.agents/training/train_5070ti.py` (`MODEL_SPECS` Zweig für `0.8b`)
- `.agents/training/TRAINING_PLAN.md` (Dokumentation der 0.8B-Rolle und Hyperparameter)

## Concrete Steps

1. In `train_5070ti.py` `MODEL_SPECS["0.8b"]` definieren:
   - `hf_16bit`: `"unsloth/Qwen3.5-0.8B"`
   - `hf_4bit`: `"unsloth/Qwen3.5-0.8B-bnb-4bit"` (falls vorhanden oder Fallback auf Basis)
   - `lora_16bit`: `"qwen35_08b_bp_lora"`
   - `dataset`: `"dataset_08b_train.jsonl"`
   - `lora_r_16bit`: `16` (bzw. 32)
2. In `TRAINING_PLAN.md` die 0.8B-Modellklasse festhalten:
   - Zweck: triviale mechanische Partials (rename, lockfile bump, doc-sync)
   - VRAM-Profil: sehr gering (<6 GB VRAM)
   - Ladder-Regel: provisorisch, keine Agent-ID vor grüner Eval
3. Preflight-Prüfung und Argument-Parsing für `--model-size 0.8b` verifizieren.

## Gate

- `python3 -m py_compile .agents/training/train_5070ti.py` -> exit 0.
- `python3 .agents/training/train_5070ti.py --help` listet `0.8b` als valide Option.

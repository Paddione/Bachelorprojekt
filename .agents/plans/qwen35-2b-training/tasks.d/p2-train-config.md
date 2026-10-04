---
id: P2
role: impl
ticket: T900978
depends_on: [P1]
target_files:
  - .agents/training/train_5070ti.py
  - .agents/training/TRAINING_PLAN.md
---

# P2 — 2B-Training-Config (unsloth/Qwen3.5-2B, 16-bit LoRA r=32)

## Ziel
Training-Config fuer Qwen3.5-2B auf RTX 5070 Ti: 16-bit LoRA r=32
(alpha=32, dropout 0, bias none, gradient-checkpointing unsloth),
VRAM-Profil 16-bit (~11-13 GB), baut auf P1-Slice-Stats auf.

## Concrete-Steps
1. P1-Artefakte lesen: Slice-Stats (`dataset_stats.json`) und
   `dataset_train.jsonl`-Zeilen-/Laengenprofil uebernehmen.
2. In `.agents/training/train_5070ti.py` 2B-Zweig ergaenzen: Checkpoint
   `unsloth/Qwen3.5-2B`, LoRA r=32/alpha=32, Output-Dir `qwen35_2b_bp_lora`.
3. Batch/Hypers festlegen: epochs 3, lr 2e-4, seq_len 2048,
   effective batch 8 (2x4), optim paged_adamw_8bit, cosine + warmup 3 %.
4. GPU-Preflight (27B-Rail stoppen, >=13 GB frei, `--force`-Override)
   fuer 2B-Zweig erhalten und Pfade anpassen.
5. `.agents/training/TRAINING_PLAN.md` §3/§6 um 2B-Zeile ergaenzen
   (Modell, LoRA, VRAM-Bedarf, Export-Pfad).
6. Config-Trockenlauf: `python3 -m py_compile` + Argparse-Help des
   2B-Zweigs pruefen (kein GPU-Burn).

## Gate
- `bash scripts/plan-lint.sh .agents/plans/qwen35-2b-training/tasks.md` PASS.
- Config-Trockenlauf (py_compile + `--help`) fehlerfrei.

## Disjunktheit
- P1 liefert Slice/Stats (generate_dataset.py); P2 fasst sie nicht an.
- P3 (eval.py), P4 (export_model.py), P5 (tests) bleiben unberuehrt.
- Fremde `ml/`-Dirs werden nie angefasst.

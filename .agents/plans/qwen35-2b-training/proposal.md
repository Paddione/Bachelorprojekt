# Proposal: Qwen3.5-2B Worker Training Set (T900978)

## WARUM
Der 2B-Worker braucht ein eigenes Training-Set (Ladder-Regel: keine Agent-IDs vor grüner Eval).
4B-Datensatz (1109 unique) und `.agents/training/`-Pipeline (generate/train/eval/export) existieren;
Notebook-Vorbefunde (Modell-Leiter, LoRA r=32, 200 Steps) liegen in `ml/qwen35_pipe_2026_10_04/` (fremd, nur lesend).

## WAS (Triage-Entscheidungen 04.10.)
- Scope: 2B-Pilot wie Ticket (0.8/4 als Folge-Tickets).
- Dataset: Slice aus `.agents/training/dataset.jsonl` ableiten (single-file edits, config, boilerplate mit Ankern), Stats neu (dedup + val split).
- Checkpoint-Kandidat: `unsloth/Qwen3.5-2B` (16-bit LoRA).
- GPU: RTX 5070 Ti lokal (frei; `train_5070ti.py` vorhanden).

## Nicht-Ziele
- Kein GPU-Burn in der Planung; 0.8/4B-Läufe; keine Agent-IDs; fremde `ml/`-Dirs unangetastet.

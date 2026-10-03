# TRAINING_PLAN.md — Qwen3-4B-2507 Bachelorprojekt-Assistent (Roadbook)

> Ersetzt den eingestellten Qwen2.5-7B-BP-Finetune (Adapter/GGUF gelöscht,
> :8080-Rail läuft seit 2026-10-03 mit Basis-Qwen3-4B-2507). Entscheidungen
> und Ablauf — reproduzierbar von einem anderen Agenten.

## 1. Ziel
Workspace-Assistent (Bachelorprojekt: Fleet-Architektur, Workflows, Tooling,
lokale LLM-Rails) auf der :8080-Worker-Rail — non-thinking, schnell, 3 Slots.

## 2. Methode — SFT (TRL `SFTTrainer` via Unsloth)
- **Warum SFT/Datensatz statt GRPO/DPO**: domänenfaktisches Assistenten-Wissen;
  es gibt keinen Verifier und keine Pairwise-Präferenzen für diesen Zweck.
- Kein Reasoning-Format nötig: Instruct-2507 generiert keine `<think>`-Blöcke.

## 3. Modell
- `unsloth/Qwen3-4B-Instruct-2507-bnb-4bit` (Fallback: `unsloth/Qwen3-4B-Instruct-2507`,
  on-the-fly 4-bit). Dichte 4B-Architektur → `FastLanguageModel`, `load_in_4bit=True`.
- LoRA: `r=16, alpha=16` (unsloth: alpha==r; der Qwen2.5-Run nutzte alpha=32),
  `lora_dropout=0`, `bias="none"`, `use_gradient_checkpointing="unsloth"`.
- Achtung: kein MTP-Head → nach dem Merge keine Draft-Model-Spekulation auf :8080.

## 4. Daten
Siehe `DATASET_PLAN.md` (≥1000 unique post-Dedup, T1 deterministisch + T2
Teacher über :1919 + T3 Human-QC). Format: `messages`, System-Prompt
„Bachelorprojekt assistant", Val-Split 5 % nach Dedup (Leak-Schutz).

## 5. Umgebung
- WSL2, Python 3.12.3, venv `~/.venvs/unsloth` (unsloth 2026.8.2, torch 2.11.0+cu128, CUDA ok).
- GPU: RTX 5070 Ti (16 GB, `CUDA_VISIBLE_DEVICES=1`) — **Vorher die 27B-Rail
  stoppen** (`systemctl --user stop qwen38-gsq-iq3xxs`), danach wieder starten.
  Das TrainingScript bricht mit Preflight ab, wenn < 12 GB frei sind (`--force` overrides).
- ADR-007: primärer Cloud-Pfad ist HF Jobs (`task finetune:hf-jobs:train`) —
  der Datensatz ist dafür direkt verwendbar (`CORPUS=<dataset_train.jsonl>`).

## 6. Hyperparameter (Stand T9009xx-Training)
| Parameter | Wert | Warum |
|---|---|---|
| epochs | 3 | ~1–2k kurze Paare; 3 Epochen ohne Overfit-Evidenz, val im Blick halten |
| lr | 2e-4 | Standard für LoRA r=16 |
| seq_len | 2048 | Workspace-Q/A ist kurz; spart KV/VRAM |
| effective batch | 8 (2×4 accum) | stabil auf 16 GB |
| optim | paged_adamw_8bit | OOM-sicher |
| scheduler | cosine + warmup 3 % | Standard, konvergiert ruhig |

## 7. Ablauf
1. `python3 .agents/training/generate_dataset.py` → T1-Basis prüfen
2. `python3 .agents/training/generate_dataset.py --teacher --target 1100` → auf ≥1000 unique aufstocken
3. T3-Stichprobe (5 %) manuell prüfen → `DATASET_PLAN.md`-Checkliste abhaken
4. `.venv`-aktivierung: `source ~/.venvs/unsloth/bin/activate`
5. `python3 .agents/training/train_5070ti.py` (Preflight beachtet die 27B-Rail)
6. `python3 .agents/training/export_model.py` → merged16 + GGUF q4_k_m/q8_0
7. Deploy auf :8080 (Alias `Qwen3-4B-2507` beibehalten!) — Schritte im Kopf von `export_model.py`
8. Evaluation: `test_3_agents_parallel.py` (3 Slots, Domänen-Fragen) + Stichproben gegen Basis-Modell

## 8. Abgrenzungen
- `scripts/finetune/` (Tandem-Projekt Qwen3.5-4B/27B/Gemma) bleibt separater
  Werkzeug-Stack mit Task-Targets; dieses Verzeichnis ist der leichtgewichtige
  BP-Assistent-Pfad.
- `test_3_agents_parallel.py` ist der Deploy-Smoke-Test (nicht Training).

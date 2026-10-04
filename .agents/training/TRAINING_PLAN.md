# TRAINING_PLAN.md — Qwen3.5-4B-MTP Bachelorprojekt-Assistent (Roadbook)

> Ersetzt den Qwen3-4B-2507-Pool (kurzlebig) und den eingestellten
> Qwen2.5-7B-BP-Finetune (Adapter/GGUF gelöscht, :8080-Rail läuft seit
> 2026-10-03 mit Qwen3.5-4B-MTP, Modell-Id `Qwen3.5-4B-MTP`). Entscheidungen
> und Ablauf — reproduzierbar von einem anderen Agenten.

## 1. Ziel
Workspace-Assistent (Bachelorprojekt: Fleet-Architektur, Workflows, Tooling,
lokale LLM-Rails) auf der :8080-Worker-Rail — Direkt-Modus default, schnell,
3 Slots (provisionales 98304 shared KV).

## 2. Methode — SFT (TRL `SFTTrainer` via Unsloth)
- **Warum SFT/Datensatz statt GRPO/DPO**: domänenfaktisches Assistenten-Wissen;
  es gibt keinen Verifier und keine Pairwise-Präferenzen für diesen Zweck.
- Kein Reasoning-Format im Training: Datensatz im Direkt-Modus
  (`enable_thinking: false`, keine `<think>`-Blöcke); Thinking bleibt ein
  reiner Inference-Modus pro Request (siehe `docs/runbooks/qwen35-worker-modes.md`).

## 3. Modell
- **T900978-Pilot `--model-size 2b` (Default)**: `unsloth/Qwen3.5-2B`
  (HF-verifiziert 04.10.: API 200, single-safetensors) + LoRA `r=32, alpha=32`,
  16-bit (~11-13 GB), Daten `dataset_2b_train.jsonl` (P1-Slice, 137 Zeilen),
  Output `qwen35_2b_bp_lora/`, 200 Steps (`--max-steps 200`), Export-Pfad
  `qwen35_2b_bp_merged/` + `qwen35_2b_bp_gguf/` (q4_k_m/q8_0).
- **Default `--precision 16bit`**: volles bf16-Checkpoint `unsloth/Qwen3.5-4B-MTP`
  (TO-VERIFY: Trainings-Checkpoint-Name aus der GGUF-Herkunft
  `unsloth/Qwen3.5-4B-MTP-GGUF` abgeleitet, noch nicht per Pull verifiziert;
  ~8 GB VRAM Gewichte) + LoRA `r=32, alpha=32` — keine Quantisierungs-Rauschbasis,
  saubereres merged-16bit/GGUF. Gesamtbedarf ~11-13 GB → passt auf die 5070 Ti.
- **Fallback `--precision 4bit`**: QLoRA auf dem bnb-4bit-Checkpoint
  (~7 GB) mit `r=16, alpha=16` — nur wenn die GPU geteilt werden muss.
- LoRA gilt: `lora_dropout=0`, `bias="none"`, `use_gradient_checkpointing="unsloth"`,
  `alpha == r` (unsloth-Empfehlung; der Qwen2.5-Run nutzte alpha=2r).
- **Kein Full Fine-Tuning** — bewusst entschieden: ~27 GB Bedarf (8+8+8 bf16/8-bit-Adam)
  vs. ~23,5 GB nutzbar über beide GPUs; DDP scheidet aus (8-GB-Karte kann nicht
  replizieren), FSDP wäre über PCIe/WSL2 ohne P2P wertlos — und 1,1k kurze Samples
  würden in Full-FT ohnehin memorisiert. Adapter bleiben die richtige Methode.
- **Export-Risiko (llama.cpp issue #24737)**: Qwen3.5-4B-GGUFs zeigen einen
  33-vs-32-Block-Count-Quirk — nach `export_model.py` den exportierten GGUF
  vor dem Deploy per `llama-cli --prompt "hi" -n 5` (oder Pool-Smoke auf :8080)
  verifizieren; bei Block-Count-Fehlern Export-Toolchain (unsloth/llama.cpp-Build)
  prüfen, bevor der Pool umgestellt wird.

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

## 6. Hyperparameter (Stand T900930-Training)
| Parameter | Wert | Warum |
|---|---|---|
| precision | 16bit (Default), 4bit via Flag | 4B hat VRAM-Raum für echte bf16-LoRA — Qualitätsgewinn ohne Kosten |
| model-size | 2b (Default, T900978), 4b-mtp | 2B-Pilot auf P1-Slice (200 Steps); 4b-mtp = shipped Run, reproduzierbar |
| max-steps | 200 (Default) | Notebook-Vorbefund; cappt Epochen auf dem kleinen Slice |
| LoRA rank | r=32 / alpha=32 (16bit) · r=16 (4bit) | mehr Adapter-Kapazität ist jetzt fast gratis; darüber Overfit-Risiko |
| epochs | 3 | ~1–2k kurze Paare; 3 Epochen ohne Overfit-Evidenz, val im Blick halten |
| lr | 2e-4 | Standard für LoRA r≤32 |
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
6. `python3 .agents/training/export_model.py` → merged16 + GGUF q4_k_m/q8_0 (danach #24737-Smoke, §3)
7. Deploy auf :8080 (Modell-Id `Qwen3.5-4B-MTP` beibehalten!) — Schritte im Kopf von `export_model.py`
8. Evaluation (`eval.py`, Sampling temp 0.8 / top_p 0.95 / top_k 40, min_p 0.05, repeat_penalty 1.0):
   - `python3 eval.py --mode compare --limit 8` → Base-vs-Tuned Side-by-Side (val-Fragen, `eval_results.json`)
   - `python3 eval.py --mode val` → ganzer Val-Split + grobes Command-Match-Signal
   - `python3 eval.py --mode interactive` → REPL gegen das getunte Modell
   - `--worker-style` = Robustheits-Check ohne BP-System-Prompt
9. Deploy-Smoke: `test_3_agents_parallel.py` (3 Slots, Domänen-Fragen)

## 8. Abgrenzungen
- `scripts/finetune/` (Tandem-Projekt Qwen3.5-4B/27B/Gemma) bleibt separater
  Werkzeug-Stack mit Task-Targets; dieses Verzeichnis ist der leichtgewichtige
  BP-Assistent-Pfad.
- `test_3_agents_parallel.py` ist der Deploy-Smoke-Test (nicht Training).

# Qwen3.5-4B instruct worker training set — Proposal

## Problem
Die :8080-Worker-Rail benötigt ein spezialisiertes finetuned 4B-Instruct-Modell für das Bachelorprojekt (Fleet-Architektur, Repo-Workflows, Tooling). Der Datensatz mit 1109 unique Samples (T1 + Teacher) liegt auf `main` vor, aber der eigentliche Trainingslauf, die Evaluierung gegen das Basismodell, der GGUF-Export mit Block-Count-Prüfung und das Deployment auf :8080 stehen für die 4B-Rail noch aus.

## Lösung
1. **Upstream-Checkpoint:** HF-ID `unsloth/Qwen3.5-4B` / `unsloth/Qwen3.5-4B-MTP` verifizieren und cachen.
2. **Trainingslauf:** 5070 Ti (16 GB), 27B-Rail stoppen (≥12 GB VRAM frei), 16-bit LoRA (r=32, alpha=32) auf `dataset_train.jsonl` (1054 Samples).
3. **Evaluation:** `eval.py` im Compare- und Val-Modus gegen das Basismodell ausführen und Metriken protokollieren.
4. **Export & Verify:** GGUF (q4_k_m, q8_0) exportieren und gegen llama.cpp Issue #24737 (Block-Count 33 vs 32) smoke-testen.
5. **Deploy & Smoke:** :8080-Service neu starten, Modell-ID `Qwen3.5-4B-MTP` beibehalten und 3-Worker-Parallelität verifizieren.

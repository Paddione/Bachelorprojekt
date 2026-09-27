---
title: "p8 — Runbook, Finetune-Inventur und erste Messung"
ticket_id: T900561
domains: [llm-local-dev, unsloth-eval-harness]
status: active
---

# p8 — Runbook, Finetune-Inventur und erste Messung

Files: `docs/runbooks/agent-bench.md`, `docs/finetune/finetune-readiness.md`,
`scripts/llm/measurements/agent-bench-gemma12-nvfp4.md` (alle neu).

## Task 8.1: Runbook

`docs/runbooks/agent-bench.md` nach dem Muster von `docs/runbooks/plan-runner.md`: Voraussetzungen
(GPU-Host, vLLM-venv, Modelle, `plan-runner`), alle `bench.mjs`-Befehle mit Flags und Exit-Codes,
Fall-Layout, Scoring-Version erhöhen (wann und wie), Profile und Laufzeit, Restore-Verhalten und
manuelle Wiederherstellung (`systemctl --user start qwen38-gsq-iq2s qwen35-mtp`,
`bash scripts/gpu-lock.sh release`), neuen Fall anlegen, Kernel-Check
(`scripts/llm/agent-bench/vllm-kernel-check.py`).

## Task 8.2: Finetune-Inventur

`docs/finetune/finetune-readiness.md`: Tabelle je Familie (Qwen3.5-4B, Qwen3.8-27B, Gemma-4-12B) mit
Basis-Checkpoint (HF-ID), Chat-Template mit `{% generation %}`-Marker (vorhanden/Lücke, Pfad),
Precision (16-bit LoRA / QLoRA nach `scripts/finetune/train.py`), Trainingsort (lokal 5070 Ti oder
HF Jobs, `taskfiles/Taskfile.finetune.yml` `hf-jobs:train`), Export-Ziel (GGUF über `export_gguf.py`
oder vLLM: `merged_16bit` + NVFP4-Quantisierung bzw. LoRA-Hot-Swap — ob vLLM LoRA auf NVFP4-Basis
lädt, hier einmal prüfen und das Ergebnis mit Befehl notieren), Vision (`train_vision.py` kennt nur
Qwen3-VL → Gemma-Vision ist Lücke). Jede fehlende Angabe als `Lücke` markiert. Verweis auf das
Korpusformat aus p6 (`sft.jsonl`, `preferences.jsonl`).

## Task 8.3: Erste Messung auf dem GPU-Host

Nach grünen p9-Tests, auf dem GPU-Host, wenn `:1919` entbehrlich ist:

```bash
node scripts/llm/agent-bench/bench.mjs run --profile quick --roles orchestrator,code-worker,vision-worker --models qwen38-27b,qwen35-4b,gemma4-12b-nvfp4 --mode chained --split eval
node scripts/llm/agent-bench/bench.mjs report <run-id>
```

Ergebnis in `scripts/llm/measurements/agent-bench-gemma12-nvfp4.md` nach Mess-Konvention: Datum,
Revision, Treiber, vLLM-Version, Kernel-Check-Ausgabe, Server-Kommandozeilen, die exakten Befehle,
Marginal-Scores, Kompatibilitätsmatrix, Entdeckungen, Infra-Fehler, Decode-Durchsatz Gemma (ein Strom).
Schlägt der Kernel-Check fehl, wird genau das mit Ausgabe dokumentiert und Gemma nicht weiter gemessen.

Akzeptanz: Runbook referenziert `bench.mjs` und `vllm-kernel-check.py` (S4); Messbericht enthält jeden
Befehl, der eine Zahl erzeugt hat; nach der Messung laufen `qwen38-gsq-iq2s` und `qwen35-mtp` wieder
(`systemctl --user is-active qwen38-gsq-iq2s qwen35-mtp`).

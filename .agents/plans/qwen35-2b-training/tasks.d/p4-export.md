---
id: P4
role: impl
ticket: T900978
depends_on: P3
target_files:
  - .agents/training/export_model.py
---

# P4 — 2B-Export (merge + GGUF + Block-Count-Verify)

## Ziel
`.agents/training/export_model.py` vom 4B-Stand auf den 2B-Artefakt-Pfad
(`unsloth/Qwen3.5-2B`-LoRA → merged-16bit → GGUF q4_k_m + q8_0) umstellen und den
Export per Trockenlauf plus llama.cpp-issue-24737-Block-Count-Verify absichern.

## Concrete-Steps
1. `LORA_DIR`/`MERGED_DIR`/`GGUF_DIR` in `.agents/training/export_model.py` auf
   2B-Pfade umstellen (`qwen35_2b_*` statt `qwen35_4b_bp_*`), 4B-Pfade entfernen.
2. Docstring/Modellnamen auf 2B anpassen (4B-MTP-Deploy-Block, `:8080`-Hinweise
   und alte `agent-models.jsonc`-Aussagen streichen oder als 2B-Hinweis fassen).
3. `save_pretrained_merged("merged_16bit")` + beide
   `save_pretrained_gguf`-Aufrufe (q4_k_m, q8_0) für das 2B-Artefakt erhalten.
4. Block-Count-Verify einbauen: nach GGUF-Export Blockzahl gegen Erwartung des
   2B-Modells prüfen (32-gegen-33-Quirk aus llama.cpp issue #24737 abfangen,
   Fehlschlag = Export FAIL mit klarer Meldung).
5. Trockenlauf ohne GPU-Burn: `python3 -m py_compile` + Export-Pfad mit
   fehlendem LoRA-Dir prüfen (sauberer Abbruch statt Traceback-Spam).

## Gate
- `bash scripts/plan-lint.sh .agents/plans/qwen35-2b-training/tasks.md` → PASS.
- `python3 -m py_compile .agents/training/export_model.py` → exit 0.
- Export-Trockenlauf + Block-Count-Verify bestehen (kein GPU-Training nötig).

## Disjunktheit
- P1 (Dataset-Slice), P2 (Train-Config), P3 (Eval), P5 (Tests) bleiben
  unberührt; dieses Partial fasst nur `.agents/training/export_model.py` an.
- Fremde `ml/`-Dirs (z. B. `ml/qwen35_pipe_2026_10_04/`) nie anfassen.

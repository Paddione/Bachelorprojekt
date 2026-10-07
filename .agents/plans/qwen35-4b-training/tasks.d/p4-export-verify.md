---
id: P4
role: impl
ticket: T900977
depends_on:
  - P3
target_files:
  - .agents/training/export_model.py
---

# P4 — GGUF Export & Issue #24737 Block-Count Guard (T900977)

## Ziel

Zusammenführen des trainierten LoRA-Adapters mit dem Basismodell und Export als GGUF-Quantisierungen (q4_k_m und q8_0). Verifikation des GGUF gegen den bekannten llama.cpp Issue #24737 (Block-Count 33 vs 32 bei Qwen3.5 4B).

## Betroffene Dateien

- `.agents/training/export_model.py`

## Steps

1. Merge und Export ausführen:
   `python3 .agents/training/export_model.py --lora-path qwen35_4b_bp_lora --quantization q4_k_m,q8_0`
2. Block-Count-Prüfung: GGUF-Header mit `llama-cli` oder GGUF-Reader inspizieren.
3. Smoke-Inferenz mit kurzem Prompt via CLI:
   `llama-cli -m qwen35_4b_bp_q4_k_m.gguf -p "Was ist die Fleet-Architektur?" -n 32`
4. Bestätigen, dass keine NaN-Tensoren oder fehlerhafte Layer-Dimensionen vorliegen.

## Gate

- Exportierte GGUF-Dateien existieren und sind valide.
- Smoke-Test via llama-cli beendet ohne Absturz oder Block-Count-Fehler.

## Disjunktheit

P4 exportiert und verifiziert GGUF-Binaries. P5 deployt auf :8080.

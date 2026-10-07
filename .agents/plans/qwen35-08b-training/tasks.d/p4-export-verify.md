---
id: P4
role: impl
ticket: T900979
depends_on:
  - P3
target_files:
  - .agents/training/export_model.py
---

# P4 — 0.8B Export & 24-Block Count Guard (T900979)

## Ziel

Export-Konfiguration für `0.8b` in `.agents/training/export_model.py` (Merge & GGUF) mit spezifischer Block-Count-Validierung (24 Layer) und Absicherung gegen den bekannten llama.cpp Issue #24737.

## Betroffene Dateien

- `.agents/training/export_model.py` (`get_export_paths` für `0.8b`, Block-Count-Erwartung: 24)

## Concrete Steps

1. In `export_model.py` `get_export_paths` um `0.8b` erweitern:
   - `lora_dir`: `HERE / "qwen35_08b_bp_lora"`
   - `merged_dir`: `HERE / "qwen35_08b_bp_merged"`
   - `gguf_dir`: `HERE / "qwen35_08b_bp_gguf"`
   - `expected_blocks`: `24`
2. `check_block_count` für 0.8B verifizieren:
   - Erwartung für 0.8B ist 24 Blocks (ggf. 25 bei #24737 Quirk).
   - Abweichungen jenseits von 24/25 führen zu einem harten FAIL.
3. Trockenlauf der Export-CLI mit `--model-size 0.8b`.

## Gate

- `python3 -m py_compile .agents/training/export_model.py` -> exit 0.
- `check_block_count(24, expected=24)` meldet PASS, `check_block_count(32, expected=24)` meldet FAIL.

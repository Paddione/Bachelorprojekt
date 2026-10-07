# Proposal: Qwen3.5-0.8B Worker Training Set (T900979)

## WARUM
Der provisorische 0.8B-Worker ist auf triviale mechanische Partials (Umbenennungen, Lockfile-Bumps, reine Doc-Syncs) beschränkt.
Ladder-Regel: Keine Agent-IDs vor grüner Evaluation; besteht das Modell die Evaluation nicht, bleibt es von der Leiter und erhält keine Produktions-Dispatches.
Der 4B-Datensatz und die Pipeline in `.agents/training/` (generate_dataset, train_5070ti, eval, export_model) existieren als Source und Vorlage.

## WAS (Triage-Entscheidungen T900979)
1. **Upstream Checkpoint**: `unsloth/Qwen3.5-0.8B` als instruct-fähiger Checkpoint (HF-verifiziert, 24 Layers, Text-Config).
2. **Minimal Slice**: Definition eines mechanischen Slices (`--slice-08b`) in `generate_dataset.py` (cli, boilerplate, gotchas) mit strikten Ankern.
3. **Training Config**: 0.8B-Spezifikation in `train_5070ti.py` und Dokumentation in `TRAINING_PLAN.md` (LoRA r=16/32, geringer VRAM-Bedarf).
4. **Hard Viability Gate**: Eval-Kriterien in `eval.py` mit hartem Viability-Gate (command-match, zero empty, zero think-leak) für 0.8B.
5. **Export & Verify**: GGUF-Export in `export_model.py` mit Block-Count-Validierung (24 Layer) und llama.cpp #24737 Guard.
6. **Testabdeckung**: BATS-Tests unter `tests/spec/llm-local-dev/qwen35-08b-training.bats` ohne GPU-/Netzwerkabhängigkeit.

## Nicht-Ziele
- Keine Agent-ID-Zuweisung in dieser Phase (Viability-Gate erst nach eval).
- Kein GPU-Burn im Planungsschritt.
- Keine 2507/freetoken-Überbleibsel.

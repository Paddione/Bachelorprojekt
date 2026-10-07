---
id: P1
role: impl
ticket: T900977
depends_on: []
target_files:
  - .agents/training/TRAINING_PLAN.md
---

# P1 — Upstream Checkpoint Pull & Preflight (T900977)

## Ziel

Verifiziere den Upstream-HuggingFace-Checkpoint für Qwen3.5-4B-MTP (`unsloth/Qwen3.5-4B` bzw. `unsloth/Qwen3.5-4B-MTP`), stelle sicher, dass der VRAM-Preflight (RTX 5070 Ti, ≥12 GB frei, Stoppen der 27B-Rail) sauber in `TRAINING_PLAN.md` dokumentiert und festgeschrieben ist.

## Betroffene Dateien

- `.agents/training/TRAINING_PLAN.md` (HF-ID Bestätigung & Preflight-Dokumentation)

## Steps

1. Prüfe die genaue HF-Modell-ID via Hub-API (`unsloth/Qwen3.5-4B` oder passender MTP/Instruct-Checkpoint).
2. Aktualisiere `TRAINING_PLAN.md` mit dem verifizierten Upstream-Status und exakten Modell-IDs.
3. Dokumentiere die Preflight-Bedingungen (GPU 1, Stoppen von `qwen38-gsq-iq3xxs`, mindestens 12 GB freier VRAM) verbindlich.
4. Scope-Guard: Nur `TRAINING_PLAN.md` wird modifiziert.

## Gate

- Checkpoint-ID auf HuggingFace existiert und ist ladbar.
- Preflight-Dokumentation in `TRAINING_PLAN.md` vollständig.

## Disjunktheit

P1 besitzt die Dokumentation und HF-Spezifikation in `TRAINING_PLAN.md`. P2 besitzt den Implementierungs- und Trainingscode in `train_5070ti.py`.

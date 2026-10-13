# Finetune-Läufe fortführen (decision-train)

Stand: 2026-10-13. Quelle: PINS.md, LESSONS.md, FINETUNE.md in
`decision-train/` (unsloth-boxes, Branch `feature/prompt-shaper`).
Regeln für jeden neuen Trainings-/Finetuning-Versuch, damit er mit
früheren Läufen vergleichbar bleibt.

## Vor jedem Lauf

1. Pins prüfen (`decision-train/PINS.md`, v3-Stack: torch 2.8.0,
   transformers 5.2.0, unsloth 2026.2.1). Kein Versions-Bump ohne
   5-Schritt-Smoke — neuere Stacks scheitern hart (Blackwell-Triton-
   Assert bei Schritt 0).
2. Schrittzahl festlegen: Default 30. 60 ist geerbt, nicht optimal
   (Eval-Loss-Minimum ≤ Schritt 20–30, danach Memorierung). Teure
   Größen erst nach 0.8B-Step-Finder (20 vs. 40, beide auf 86 Fällen
   scoren).

## Pipeline (Reihenfolge einhalten)

1. `measure_corpus.py` → 2. `template_guard.py` → 3. `train.py`
   → 4. `evals/run_adapter.py` auf BEIDEN Testsets
   (`instruct-worker.jsonl`, 42 Fälle; `agent-actions.jsonl`,
   44 Fälle; Base + Adapter) → 5. Export-Sonderweg Qwen3.5.
2. Scoreboard fortschreiben (Referenz: 4B-v2 SFT 41/42 + 32/44;
   2B-30 40/42 + 21/44). Nur was beide Testsets besteht, gilt.
3. Export: Merge-Präzision = Trainings-Präzision (16bit für
   Qwen3.5; 4bit-Load korrumpiert trotz Erfolg-Logs). Merge erst
   unter Transformers smoken (scoring-identischer Prompt,
   `repetition_penalty=1.1`), dann GGUF-Konvertierung.

## Disziplin

- Eine Variable pro Lauf (Modell, Korpus, Schritte, Template —
  nie mehrere zugleich ändern).
- Bulk-Daten (Corpora, Adapter, GGUFs) nicht committen, nur über
  `corpora/`-Builder regenerieren.
- Jede Falle sofort in `LESSONS.md` festhalten (inkl. falscher
  Fährten, z. B. `compute_loss_func`-Patch: gebaut, wirkungslos,
  revertiert).
- DPO band mit SFT gleichauf — bei Gleichstand gewinnt Einfachheit.
- Capacity-Floors akzeptieren, nicht weg-trainieren (0.8B für
  JSON-Tool-Calls geparkt: 10/42 + 3/44 trotz 68 Format-Drills).

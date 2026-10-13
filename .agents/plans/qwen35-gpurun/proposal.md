# Proposal: Qwen3.5-2B echter GPU-Run, Eval, Export-Verify, Agent-IDs (T901041)

Ticket: T901041 (feat, mentolder). Branch: `feature/qwen35-gpurun-T901041`.
Vorgänger: T900978 (Code-Lane, PR #6264 gemergt als 20b75505d).

## WARUM

Die 2B-Trainings-Lane (Skripte, Slice, Thresholds, Block-Count-Verify) liegt seit
T900978 gemergt auf main, wurde aber nie auf echter GPU-Hardware ausgeführt —
die Planungs-Sandbox hatte kein CUDA-Device. Ohne echten Run bleibt die
2B-Worker-Klasse off-ladder (provisorisch, keine Agent-IDs) und
`subagent-provisioning.md` §2 ein Versprechen ohne Beleg. Dieses Ticket schließt
die Lücke: trainieren, evaluieren, exportieren, und erst bei grünem Eval die
2B-Klasse mit Agent-IDs in die Live-Leiter aufnehmen.

## WAS (Scope, 4 Items aus dem Ticket)

1. Echter GPU-Run `train_5070ti.py --model-size 2b` (LoRA r=32, 200 Steps,
   16-bit) auf CUDA-Host mit RTX 5070 Ti.
2. Eval `--mode val` auf `dataset_2b_val.jsonl` (7 Fragen, volle Split, kein
   Limit) gegen die Viability-Thresholds: command-match mindestens 0.70,
   empty-rate 0.0, think-leak-rate 0.0. Iteration bis grün.
3. Export (merged-16bit + GGUF q4_k_m/q8_0) mit Block-Count-Verify
   (erwartet 32, Toleranz 33 als llama.cpp-Issue-24737-Quirk) plus GGUF-Smoke.
4. Agent-IDs für die 2B-Klasse erst nach grünem Eval (Ladder-Rule aus
   `subagent-provisioning.md`): `qwen35-2b` (`plan-worker-qwen35-2b`),
   analog zu `qwen35-4b` (`plan-worker-qwen35`).

## Verifizierte Ausgangslage (Phase A, auf main gemessen)

- `train_5070ti.py --model-size 2b --dry-run --force` endet mit
  Configuration OK (unsloth/Qwen3.5-2B, 16-bit, dataset_2b_train.jsonl,
  qwen35_2b_bp_lora, epochs 3, max_steps 200, lr 0.0002).
- Beobachtung: Der VRAM-Preflight läuft vor dem Dry-Run-Check, daher braucht
  die Validierung auf belegtem Host `--force`. Keine Code-Änderung geplant,
  der Plan nutzt das Flag.
- `eval.py --model-size 2b --mode val --limit 0 --dry-run` endet mit Config OK
  und bestätigt die Thresholds (cmd mindestens 0.70, empty/leak 0.000).
- Datensplit: 144 voll / 137 train / 7 val, Val-Anteil 4.9 Prozent
  (innerhalb 5 Prozent plus/minus 2).
- Baseline grün: 5 Tests im 2B-Modul bestehen
  (`test_qwen35_2b_training.py`).
- Prior-Art-Suche: keine ADR, kein Spec-Guard zu `.agents/training` oder
  `subagent-provisioning` (Schritt 0.7, Fundstelle: keine).
- GPU-Artefakte (LoRA-Adapter, merged, GGUF, Eval-Results) sind aktuell
  nicht git-ignoriert; der Plan legt `.agents/training/.gitignore` neu an.
- venv `/tmp/opencode/venv-2b` existiert auf diesem Host nicht; die
  Execute-Phase provisioniert torch/unsloth/trl/datasets auf dem CUDA-Host.

## Nicht-Ziele

- Kein GPU-Run in der Planungsphase (nur einplanen).
- Keine Änderung an `train_5070ti.py`, `eval.py`, `export_model.py`:
  Iteration läuft über CLI-Flags (lr, max-steps). Verlangt die Iteration
  Code, braucht es einen Folgeplan.
- Keine 0.8B/4B-Änderungen, keine Deploy-Schritte auf der Windows-Seite,
  keine Rail-Änderung außer Stop/Restore rund um den Run.

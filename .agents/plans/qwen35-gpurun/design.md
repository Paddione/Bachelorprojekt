---
ticket_id: T901041
plan_ref: .agents/plans/qwen35-gpurun/tasks.md
status: active
date: 2026-10-11
---

# Design-Spec: Qwen3.5-2B GPU-Run-Lane (T901041)

## Entscheidungen (Brainstorming, nicht-interaktiv aus Ticket + Code abgeleitet)

1. Single-Plan mit einem Partial: ein Subsystem (Training-Lane plus Gating),
   vier Dateien, GPU-Ausführung dominiert. Kein Fan-out, `--partials 1`.
2. Rot/Grün-Nachweis über GPU-gated Test im bestehenden 2B-Modul: ohne CUDA
   (`nvidia-smi` fehlt) skippt der Test, auf dem CUDA-Host ist er vor dem Run
   rot und nach grünem Eval grün. CI bleibt grün.
3. Agent-ID `plan-worker-qwen35-2b` (Klasse `qwen35-2b`), strikt analog zur
   bestehenden 4B-Konvention. Eintrag in die Live-Leiter (§1) erst nach
   grünem Eval; §2-Eintrag der 2B-Klasse wird dabei entfernt.
4. Run-Evidenz ist zweigleisig: lokale Artefakte (git-ignoriert) plus
   Ticket-Kommentar mit Metriken und Pass/Fail plus Run-Nachtrag in
   TRAINING_PLAN.md. Der Gate-Test liest das lokale Artefakt.

## Ablauf auf dem CUDA-Host (Execute-Phase)

1. Rail stoppen: `systemctl --user stop qwen38-gsq-iq3xxs` (GPU 1, 5070 Ti).
2. venv provisionieren (torch, unsloth, trl, datasets), Checkpoint-Pull
   `unsloth/Qwen3.5-2B` verifizieren.
3. Trainieren: `python3 .agents/training/train_5070ti.py --model-size 2b`
   (16-bit, r=32, 200 Steps). Preflight verlangt mindestens 13000 MiB frei.
4. Evaluieren: `python3 .agents/training/eval.py --model-size 2b --mode val
   --limit 0`. Schwellwert: command-match mindestens 0.70, empty 0.0,
   think-leak 0.0. Bei Rot: Hyperparameter über Flags variieren und ab
   Schritt 3 wiederholen, bis grün.
5. Exportieren: `python3 .agents/training/export_model.py --model-size 2b`,
   Block-Count-Verify (32 erwartet, 33 toleriert mit Warnung), danach
   GGUF-Smoke (`llama-cli --prompt "hi" -n 5`, entfällt mit Vermerk falls
   das Binary auf dem Host fehlt).
6. Rail restaurieren: `systemctl --user start qwen38-gsq-iq3xxs`.
7. Evidenz sichern: Ticket-Kommentar (Metriken, Thresholds-Vergleich,
   Block-Count, Smoke-Ergebnis), Run-Nachtrag in TRAINING_PLAN.md.

## Test-Strategie

- Bestehendes Modul `tests/py/spec/native_ported/spec/llm-local-dev/
  test_qwen35_2b_training.py` erweitern (keine neue Datei, keine
  Ticketnummer im Namen). Wachstum rund 40 Zeilen, bleibt deutlich unter
  dem S1-Limit von 800 (Ist 119, Restbudget 681).
- Neuer Gate-Test: CUDA-Guard per `shutil.which("nvidia-smi")` mit
  `pytest.skip` ohne GPU; danach harte Asserts (Artefakt
  `eval_2b_results.json` vorhanden, `check_thresholds` über den
  gespeicherten Rows ist PASS). Konventionen aus `tests/CLAUDE.md`:
  Output-Verifikation, kein Source-Grep, kein neuer Testpfad.
- Lokale Artefakte landen in `.agents/training/` und werden über die neue
  `.gitignore` dort von Git ferngehalten; Datensätze (`dataset_*.jsonl`)
  bleiben getrackt.

## Dateiänderungen

- Testmodul erweitern (Gate-Test, siehe oben).
- `subagent-provisioning.md`: 2B-Klasse nach grünem Eval in §1 als live
  eintragen (Worker `qwen35-2b`, Rail analog 4B auf :8080, Rolle: kleine
  begrenzte Partials), §2-Listeneintrag streichen.
- `TRAINING_PLAN.md`: Run-Nachtrag (Datum, Host, Steps, Metriken, Eval-PASS,
  Block-Count, Smoke).
- `.agents/training/.gitignore`: neu, ignoriert LoRA-/merged-/GGUF-Verzeichnisse,
  `eval_*_results.json`, `outputs/`, `__pycache__/`.

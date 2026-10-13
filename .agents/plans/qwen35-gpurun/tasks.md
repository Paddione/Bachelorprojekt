---
title: "qwen35-gpurun — Implementation Plan"
ticket_id: T901041
domains: [training, llm-local-dev]
status: active
---

# qwen35-gpurun — Implementation Plan

Echter GPU-Run der gemergten 2B-Lane (T900978/PR #6264): trainieren, evaluieren,
exportieren, und erst bei grünem Eval die 2B-Worker-Klasse mit Agent-IDs in die
Live-Leiter aufnehmen. Der GPU-Run findet auf dem CUDA-Host statt (RTX 5070 Ti,
GPU 1); die Planung validiert nur per Dry-Run.

_Ticket: T901041. Vorgänger: T900978 (done, shipped)._

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/py/spec/native_ported/spec/llm-local-dev/test_qwen35_2b_training.py` | 119 | 681 |
| `.agents/skills/references/subagent-provisioning.md` | 82 | n/a |
| `.agents/training/TRAINING_PLAN.md` | 98 | n/a |
| `.agents/training/.gitignore` | neu | n/a |

Budget-Quelle: `yq '.s1.limits' docs/code-quality/gates.yaml` (`.py` 800);
die Testdatei ist nicht gebaselinet, wirksame Schwelle ist das Limit. Die
`.md`-Dateien misst S1 nicht, die `.gitignore` wird neu angelegt — daher dort
kein Zahlen-Budget. Das Testmodul wächst um rund 40 Zeilen und bleibt damit
deutlich unter der Schwelle.

## Tasks

- [ ] **1. Rotphase: Viability-Gate-Test erweitern und Rot belegen.**
  Erweitere `tests/py/spec/native_ported/spec/llm-local-dev/test_qwen35_2b_training.py`
  um `test_p5_viability_gate_green_eval_results_pass_thresholds`: CUDA-Guard
  per `shutil.which("nvidia-smi")` (`pytest.skip` ohne GPU, damit CI grün
  bleibt), danach harte Asserts — `eval_2b_results.json` vorhanden und
  `check_thresholds` über den gespeicherten Rows meldet PASS. Keine neue
  Testdatei, Konventionen aus `tests/CLAUDE.md` (Output-Verifikation).
  Rot-Nachweis auf dem CUDA-Host vor dem Run:
  ```bash
  bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/llm-local-dev/test_qwen35_2b_training.py -k viability_gate
  ```
  expected: FAIL (Artefakt fehlt, Adapter fehlt). Der Runner ist pytest
  über `pytest-run.sh`.
- [ ] **2. GPU-Run auf dem CUDA-Host (Train + Eval, Iteration bis grün).**
  Rail stoppen (`systemctl --user stop qwen38-gsq-iq3xxs`), venv mit
  torch/unsloth/trl/datasets provisionieren, Checkpoint `unsloth/Qwen3.5-2B`
  per Pull verifizieren. Trainieren:
  ```bash
  python3 .agents/training/train_5070ti.py --model-size 2b
  ```
  (16-bit, LoRA r=32, 200 Steps; Preflight verlangt mindestens 13000 MiB
  frei auf GPU 1). Evaluieren:
  ```bash
  python3 .agents/training/eval.py --model-size 2b --mode val --limit 0
  ```
  Schwellwert: command-match mindestens 0.70, empty-rate 0.0,
  think-leak-rate 0.0. Bei Rot Hyperparameter nur über Flags variieren
  (`--lr`, `--max-steps`) und Train/Eval wiederholen, bis grün. Evidenz
  als Ticket-Kommentar sichern (Metriken, Schwellwert-Vergleich).
- [ ] **3. Export, Block-Count-Verify, Smoke, Rail-Restore.**
  ```bash
  python3 .agents/training/export_model.py --model-size 2b
  ```
  merged-16bit plus GGUF q4_k_m/q8_0; Block-Count-Verify erwartet 32,
  33 gilt mit Warnung als llama.cpp-Issue-24737-Quirk, alles andere ist
  hartes Rot. Danach GGUF-Smoke (`llama-cli --prompt "hi" -n 5`;
  entfällt mit Vermerk im Ticket-Kommentar, falls das Binary auf dem Host
  fehlt). Rail restaurieren (`systemctl --user start qwen38-gsq-iq3xxs`).
  Lokale Artefakte (Adapter, merged, GGUF, Results) bleiben unversioniert.
- [ ] **4. Grünphase: Gate grün, Agent-IDs, Run-Nachtrag, Ignore-Datei.**
  Gate-Test aus Task 1 auf dem CUDA-Host grün laufen lassen (pytest über
  `pytest-run.sh`, jetzt PASS erwartet). Erst danach
  `.agents/skills/references/subagent-provisioning.md` anfassen: Klasse
  `qwen35-2b` (`plan-worker-qwen35-2b`) in die Live-Leiter §1 eintragen
  (Rolle: kleine begrenzte Partials), §2-Eintrag streichen — keine
  Agent-IDs ohne grünes Eval (Ladder-Rule). Run-Nachtrag in
  `.agents/training/TRAINING_PLAN.md` (Datum, Host, Steps, Metriken,
  Eval-PASS, Block-Count, Smoke). `.agents/training/.gitignore` neu
  anlegen (LoRA-/merged-/GGUF-Verzeichnisse, `eval_*_results.json`,
  `outputs/`, `__pycache__/`; Datensätze bleiben getrackt).
- [ ] **5. Finaler Verifikations-Task.** Führe in dieser Reihenfolge aus:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei müssen grün sein. Keine neue Testdatei, daher kein
  Inventar-Commit; `freshness:regenerate` deckt generierte Artefakte ab.

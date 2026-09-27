---
ticket_id: T900561
plan_ref: openspec/changes/agent-bench/tasks.md
status: active
date: 2026-09-27
---

# Design: agent-bench

_Ticket: T900561_

## Context

- Hardware (GPU-Host PK-Desktop, WSL2): RTX 5070 Ti 16 GB (Blackwell, sm_120, CPU-Slot PCIe 4.0 x16) und RTX 3060 Ti 8 GB (Ampere, B550-Chipsatz-Slot x4), Ryzen 7 5800X3D, 64 GB DDR4. Keine weitere GPU geplant.
- Produktiv: `qwen38-gsq-iq2s.service` (Qwen3.8-27B IQ2_S-mtp, llama.cpp, `:1919`, 5070 Ti) als Orchestrator, `qwen35-mtp.service` (Qwen3.5-4B, `:1920`, 3060 Ti, 3 Slots) als Worker, gesteuert von `scripts/llm/plan-runner.mjs`.
- Bestehender Bench `scripts/llm/bench-orchestration.mjs`: nur Orchestrator, 5 synthetische Aufgaben, Pass/Fail (Qwen3.8 IQ2_S 13/15, IQ3_XXS 15/15).
- vLLM 0.30.0 (torch 2.13, CUDA 13.2) ist unter `~/opt/vllm-nvfp4` installiert, `unsloth/gemma-4-12b-it-NVFP4` (9,3 GB) unter `~/models/gemma-4-12b-it-NVFP4`.
- NVFP4-27B/35B-Modelle passen nicht: Gewichte allein 22,6 GB (Qwen3.8-27B), 23,4 GB (Qwen3.6-27B), 16,9 GB (Gemma-4-26B-A4B). Tensor-Parallel über beide Karten scheidet aus (Architektur, kein FP4 auf Ampere, Chipsatz-Anbindung).
- WSL-Grenze: ab ~15,9 GB Gerätespeicher lagert CUDA still in den Systemspeicher aus.
- Software Factory ist stillgelegt (T900399); Factory-Traces sind keine Datenquelle.
- Prior Art: `openspec/specs/unsloth-eval-harness.md` (gepaarte Messung, Unseen-by-Training, Regression-Gate, Cases-as-Data) — wird übernommen, nicht geändert.

## Goals / Non-Goals

**Goals:**
- Für jede Rolle und jede Modellkombination eine reproduzierbare, mehrdimensionale Bewertung.
- Cross-Model-Kompatibilität und unerwartet gute Kombinationen sichtbar machen.
- Jede unklare Änderung jederzeit nachmessbar (Gate gegen Baseline).
- Jeder Lauf erzeugt Trainingsdaten im selben Format, ohne Eval-Kontamination.

**Non-Goals:**
- LLM-als-Richter (später als getrennte Spalte möglich).
- Training, Export trainierter Modelle, produktiver Modellwechsel.
- Tensor-Parallel oder zweite 5070 Ti.

## Decisions

| ID | Frage | Entscheidung | Verworfen |
|---|---|---|---|
| D1 | Harness-Basis | Neuer Bench über den echten Plan-Runner-Ablauf (Plan-Runner-Format, `opencode run` für Worker) | `bench-orchestration.mjs` erweitern (Kunstumgebung, Traces weichen vom Produktivformat ab); `eval_harness.py` (Einzelschritt-Klassifikation) |
| D2 | Aufgabenquelle | Mix: 5–6 Fixture-Fälle + 2–3 Replays archivierter Changes, ~8 Fälle à 3–5 Varianten | nur Fixture; nur Replays |
| D3 | Fallgrundlage | Jeder Fall beruht auf einer echten Begebenheit (`source.md`, Pflicht) und prägt sie in Perspektiven aus: `clean`, `ambiguous`, `faulty-worker`, `conflicting`, `detour-trap`, `vision` | freie synthetische Aufgaben |
| D4 | Rollen | Planner, Orchestrator, Code-Worker, Vision-Worker, Reviewer; Auswahl per `--roles` | feste Rollenmenge |
| D5 | Bewertung | Vektor O/E/D/T, Score = 100·O − w·E − w·D − Budgetabzug, Untergrenze 0; `scoring.yaml` versioniert; deterministisch | LLM-Judge in v1 |
| D6 | Planner-Bewertung | Nicht gegen festes Setup, sondern über die Kombinationsmatrix (Marginal-Score über alle Ausführungsbelegungen) | fest gepinntes Ausführungs-Setup |
| D7 | Kombinationen | Modell-Pool `models.yaml`; Stufen Plan → Ausführung → Review mit Cache je (Variante, Modell, Rep); Ausführungspaare nur aus gleichzeitig residenten Modellen; Scheduler gruppiert nach Loadout | volles Kreuzprodukt ohne Cache |
| D8 | Report | Marginal-Scores, Kompatibilitätsmatrix (Wechselwirkungseffekt), Entdeckungen, Infra-Fehler separat | Einzelzahl je Modell |
| D9 | Traces | Proxy je Rolle auf eigenem Port; neutrales OpenAI-Chat-Format; Bilder per SHA-256-Datei; Secret-Schwärzung mit Marker; `manifest.json` je Run | Logging im Harness (verfehlt `opencode`-Worker) |
| D10 | Korpus | Beste saubere Trajektorie (O=1, E=0, D=0) je Variante/Rolle; Präferenzpaare; Lückenliste; Teacher füllt Lücken optional | alles ungefiltert exportieren |
| D11 | Kontamination | `split: eval`/`train` je Begebenheit; Export nur `train`, Gate nur `eval` | Split je Variante |
| D12 | Profile | `quick` ≤ 1 h (Diagonale + Baseline, 1 Rep); `full` nachts (ganze Matrix, 3 Reps, bei Überlauf Stichprobe mit Seed) | ein Profil |
| D13 | Gemma-Serving | vLLM 0.30.0, nur 5070 Ti, `--gpu-memory-utilization 0.88`, FP8-KV, `--max-model-len 65536`, Tool-Parser, Kernel-Check gegen Marlin, Spill-Check | llama.cpp-GGUF (anderer Vergleich) |
| D14 | Loadout-Sicherheit | `gpu-lock.sh`, `qwen38-gsq-iq2s` stoppen, Wiederherstellung per trap/finally auch bei Abbruch | manuelles Umschalten |
| D15 | Finetune-Readiness | Inventur je Familie (Checkpoint, Template mit Generation-Marker, Precision, Ort, Export-Ziel, Vision) in Phase 3; Umsetzung als Folge-Change | alles vorab bereitstellen |
| D16 | Altbench | `bench-orchestration.mjs` bleibt bis Ende Phase 1 als Vergleichswert, seine 5 Aufgaben werden nicht übernommen (keine echte Begebenheit) | sofort löschen |

### Struktur

```
scripts/llm/agent-bench/
  bench.mjs            CLI: run | resume | report | gate | export-corpus
  lib/cases.mjs        Fall-/Varianten-Laden und Validierung
  lib/scoring.mjs      O/E/D/T je Rolle, scoring.yaml
  lib/recorder.mjs     Proxy je Rolle, Schwärzung, Bild-Ablage
  lib/matrix.mjs       Belegungen, Stufen-Cache, Loadout-Scheduler
  lib/loadouts.mjs     systemd-run, gpu-lock, Kernel-/Spill-Check, Restore
  lib/report.mjs       Marginal/Kompatibilität/Entdeckungen, Gate
  lib/corpus.mjs       Export, Präferenzpaare, Lücken
  scoring.yaml  models.yaml
  cases/<fall-id>/{source.md, base/|replay.yaml, variants/<vid>/{brief.md, variant.yaml, reference/, checks/}}
runs/<run-id>/{manifest.json, state.json, <stufe>/<variante>/<modell>/<rep>/{trace.jsonl, artefakte, score.json}}
```

`runs/` liegt außerhalb des Repos (`~/agent-bench-runs`), nur Reports gehen nach `scripts/llm/measurements/`.

### Rollen: Eingabe → Ausgabe → Outcome

| Rolle | Eingabe (isoliert) | Ausgabe | Outcome |
|---|---|---|---|
| Planner | `brief.md` + Repo | Plan (Partials) | Anteil sauber ausgeführter Partials über die Ausführungsbelegungen; `ambiguous` → nur Rückfrage korrekt |
| Orchestrator | Referenz-Plan | Plan-Runner-Lauf | alle Partials `done`, Checks grün |
| Code-Worker | Referenz-Partial | Diff + `PLAN-RUNNER-RESULT` | versteckte Tests grün |
| Vision-Worker | Bild + Frage | strukturierte Antwort | Felder stimmen, keine erfundenen Elemente |
| Reviewer | sauberer oder defekter Diff | pass/fail + Begründung | richtiges Urteil, Defekt benannt; falsches Pass ×3 |

## Lieferphasen

1. Gerüst, Recorder, Scoring, Orchestrator- und Code-Worker-Rolle, 2–3 Fälle, Gemma-vLLM-Loadout; erste Messung Gemma gegen Baseline.
2. Planner, Reviewer, Vision-Worker, Matrix-Scheduler, restliche Fälle.
3. `export-corpus`, Finetune-Inventur, Entfernen von `bench-orchestration.mjs`.

## Risks / Trade-offs

- **vLLM unter WSL2 auf sm_120**: FP4-Kernel könnten fehlen → Kernel-Check bricht als Infra-Fehler ab; Gemma fällt dann aus dem Pool, der Bench bleibt nutzbar.
- **Laufzeit**: `opencode`-Worker sind langsam; `quick` hält das Budget nur mit knapper Variantenauswahl. Messung in Phase 1 entscheidet die Auswahl.
- **Rauschen**: Sampling-Varianz macht Einzelläufe unzuverlässig; Gate-Schwelle aus 3 Reps, `quick` ist nur Frühwarnung.
- **Umladekosten**: jeder Loadout-Wechsel kostet 0,5–3 min; Scheduler minimiert Wechsel.
- **Replay-Determinismus**: echte Changes haben Umgebungsabhängigkeiten; Replays nur mit offline lauffähigen Checks.
- **Produktionsausfall**: `:1919` ist während eines Laufs weg; Restore-Garantie per trap, `full` nur nachts.
- **Kombinatorik**: 3–4 Modelle × 5 Rollen wachsen schnell; Stufen-Cache und Stichprobe mit Seed begrenzen.

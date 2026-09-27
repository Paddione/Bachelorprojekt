## Why

Welches lokale Modell welche Agentenrolle am besten erfüllt, lässt sich heute nur für den Orchestrator und nur über fünf synthetische Pass/Fail-Aufgaben messen (`scripts/llm/bench-orchestration.mjs`). Neue Kandidaten wie Gemma-4-12B-it-NVFP4 in vLLM, Kombinationen verschiedener Modelle und die Wirkung eines Finetunings lassen sich damit weder fair vergleichen noch nach einer unklaren Änderung nachmessen. Gleichzeitig entstehen bei jedem Lauf Trajektorien, die als Trainingsdaten verloren gehen, weil sie in keinem trainierbaren Format abgelegt werden.

## What Changes

- Neuer Bench `scripts/llm/agent-bench/` (Node, nur Standardbibliothek) mit den Rollen Planner, Orchestrator, Code-Worker, Vision-Worker und Reviewer; die zu messenden Rollen werden beim Start gewählt.
- Fälle beruhen verpflichtend auf einer echten Begebenheit (archivierter Change, Bug-Ticket, Incident) und prägen sie in mehreren Varianten-Perspektiven aus (`clean`, `ambiguous`, `faulty-worker`, `conflicting`, `detour-trap`, `vision`); Soll-Plan im Plan-Runner-Format, versteckte Checks.
- Bewertung je Lauf als Vektor aus Outcome, Fehlern, Umwegen und Aufwand gegen ein Referenzbudget, mit versionierter `scoring.yaml` und ohne LLM-Richter.
- Kombinationsmatrix über einen Modell-Pool (`models.yaml`) mit Stufen-Cache (Plan, Ausführung, Review) und Loadout-Scheduler; Report mit Marginal-Scores, Kompatibilitätsmatrix und hervorgehobenen Entdeckungen.
- Trace-Recorder als Proxy je Rolle, Ablage im neutralen OpenAI-Chat-Format mit Secret-Schwärzung; `export-corpus` liefert die beste saubere Trajektorie je Variante und Rolle, Präferenzpaare und eine Lückenliste, strikt getrennt nach `split: eval`/`train` je Begebenheit.
- `gate` vergleicht gepaart gegen eine gespeicherte Baseline und endet mit Exit ≠ 0 bei Regression über der Rauschschwelle.
- Neuer GPU-Loadout für Gemma-4-12B-it-NVFP4 in vLLM auf der RTX 5070 Ti mit Kernel- und Spill-Check; der produktive Orchestrator wird nach jedem Lauf garantiert wiederhergestellt.
- Finetune-Inventur je Modellfamilie (Qwen3.5-4B, Qwen3.8-27B, Gemma-4-12B): Checkpoint, Chat-Template mit Generation-Marker, Precision, Trainingsort, Export-Ziel.
- `scripts/llm/bench-orchestration.mjs` bleibt bis zum Abschluss von Phase 1 als Vergleichswert bestehen und wird danach entfernt.

## Capabilities

### New Capabilities
- `agent-bench`: Rollenbasierter, reproduzierbarer Modell-Bench mit Kombinationsmatrix, Regressions-Gate und Export trainierbarer Trajektorien.

### Modified Capabilities
<!-- keine: unsloth-eval-harness und llm-local-dev (plan-runner) werden genutzt, ihre Requirements ändern sich nicht -->

## Non-Goals

- Kein LLM-als-Richter in dieser Version.
- Kein Training und kein Export trainierter Modelle; die Finetune-Inventur beschreibt nur, was dafür nötig ist.
- Kein produktiver Wechsel des Orchestrator-Modells; der Bench liefert die Entscheidungsgrundlage.
- Keine Übernahme der Software-Factory-Traces; die Factory ist stillgelegt (T900399).

## Impact

- Neuer Code: `scripts/llm/agent-bench/**`, Tests unter `tests/spec/agent-bench/`.
- Neuer Loadout-Eintrag in `scripts/llm/loadouts.json` und Startdefinition für vLLM (`~/opt/vllm-nvfp4`, vLLM 0.30.0).
- GPU-Host: der Bench stoppt `qwen38-gsq-iq2s.service` für die Laufdauer (quick ≤ 1 h) und nimmt `scripts/gpu-lock.sh`.
- Optional: systemd-User-Timer für das nächtliche `full`-Profil.
- Doku: Runbook `docs/runbooks/agent-bench.md`, Messberichte unter `scripts/llm/measurements/`.

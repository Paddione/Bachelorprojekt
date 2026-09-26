# Proposal: plan-runner

## Why

Der lokale Orchestrator (Qwen3.8-27B GSQ-RCO IQ2_S-mtp auf der RTX 5070 Ti, `:1919`) soll OpenSpec-Pläne
mit maximalem Durchsatz ausführen. Heute delegiert er in opencode per `task` an `qwen35-mtp` (Qwen3.5-4B,
RTX 3060 Ti, `:1920`) oder an `local` (sich selbst). Das `task`-Tool blockiert: Während der Orchestrator
auf einen Subagenten wartet, bleibt jede freie GPU ungenutzt, und niemand verteilt die nächste offene
Partial. Ist der 4B-Worker belegt, gibt es keine Regel, die den Orchestrator die Partial selbst in einem
Zug erledigen lässt.

Die Messungen vom 2026-09-26 zeigen, dass das Einfrieren des Orchestrators billig ist: Verdrängt ein
Subagent den einzigen Slot, stellt `--cache-ram` den 51k-Token-Orchestrator-Kontext in 2,9 s wieder her
(kalt: 48 s). Explizites Slot-Save/Restore ist bei diesem Hybridmodell unbrauchbar (volles Neu-Prefill).

## What

- Neuer Scheduler `scripts/llm/plan-runner.mjs` (Node, nur Standardbibliothek) mit den Modulen
  `scripts/llm/plan-runner/plan.mjs` (Manifest, Abhängigkeiten, Zustand) und
  `scripts/llm/plan-runner/workers.mjs` (opencode-Worker, Slot-Verwaltung, Ergebnis).
- Masterplan = OpenSpec-Change: `tasks.md`-Partial-Manifest + `tasks.d/pX-*.md`. Fortschritt und die
  Orchestrator-Notizen liegen in `openspec/changes/<slug>/.plan-runner/state.json`.
- Der Orchestrator ist ein Tool-Loop gegen `:1919` mit `plan_status`, `dispatch_4b`, `execute_self`,
  `wait_event`, `mark` und `finish`. `execute_self` ist nur erlaubt, wenn alle 4B-Slots belegt sind: Der
  Scheduler speichert den Masterplan-Stand, startet `opencode run --agent local` mit allen Tasks der
  Partial und blockiert den Orchestrator bis zur Rückmeldung (Erfolg/Fehlschlag). Sein KV-Zustand liegt
  währenddessen per `--cache-ram` im Host-RAM.
- Während der Orchestrator schläft, weist der Scheduler freien 4B-Slots selbstständig die nächste offene
  Partial zu.
- Messung 1 vs. 2–4 Slots für den 4B auf der RTX 3060 Ti; die gemessene Slot-Zahl wird Default.
- `local` in `.opencode/agent-models.jsonc` wird auf das neue `:1919`-Modell umbeschriftet.

Abhängigkeit: Branch `chore/llm-bench-orchestration-T900480` (Unit `qwen38-gsq-iq2s.service`, Messungen,
Orchestrierungs-Benchmark) muss vor der Umsetzung auf `main` sein.

_Ticket: T900504_

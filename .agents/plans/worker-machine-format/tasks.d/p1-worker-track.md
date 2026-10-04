---
id: P1
role: impl
ticket: T901014
depends_on: []
target_files:
  - scripts/llm/plan-runner/workers.mjs
  - scripts/llm/plan-runner.mjs
---

# P1 — Worker-Track (Ausfuehrung)

## Ziel

Worker-Ausfuehrung als eigenen Track neben Receipt/Delete etablieren:
Pool/Agent-Trennung sauber kapseln, dispatch-Policy explizit machen
(Self vs. 4B-Slots vs. Sequenz), Scheduler-Aufruf aus dem Runner
daran anbinden. Runner-Handoff/FACTORY-REF ist OUT (-> T901015).

## Betroffene Dateien

- `scripts/llm/plan-runner/workers.mjs` — Pool-Aufbau, Agent-Mapping, spawn
- `scripts/llm/plan-runner.mjs` — Scheduler-Verdrahtung, dispatch-Aufruf

## Steps

1. `workers.mjs` inventarisieren: Pool-Erzeugung, Agent-Auswahl, spawn-Pfad je Partial notieren.
2. Pool/Agent-Trennung ziehen: Pool-Verwaltung (Slots, free4b, Belegung) von Agent-Aufbau (Modell, env, PWD) entkoppeln.
3. dispatch-Policy als eine Funktion fassen: Eingaben Partial-Status/dependsOn/Slot-Lage, Ausgabe Self-vs-Worker-Entscheidung.
4. `plan-runner.mjs`-Scheduler (`createScheduler`) auf die dispatch-Funktion umstellen, bisherige Inline-Verzweigung entfernen.
5. PWD/worktree-Vererbung im Worker-spawn absichern (Regression aus Qwen3-4B-Fix erhalten).
6. Retry/attempts-Semantik (`mark open` bei attempts<=MAX_RETRIES) gegen neue dispatch-Funktion pruefen, kein Stillstand bei verbrauchten Partials.
7. `node --check` auf beide Dateien, dann manueller Dry-Run des Runners auf Toy-Plan (2 Partials, Self-Ausfuehrung).
8. `bash scripts/plan-lint.sh .agents/plans/worker-machine-format/tasks.md` -> PASS vor Abgabe.

## Gate

- plan-lint PASS, `node --check` beider Dateien fehlerfrei
- llm-local-dev-BATS gruene (Abdeckung ueber P4, hier nur Regression)

## Disjunktheit

P2 arbeitet nur in `plan.mjs`, P3 nur in `plan-lint.sh`, P4 nur in `tests/` — keine Ueberlappung mit diesem Partial.

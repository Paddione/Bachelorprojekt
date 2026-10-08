# Proposal: Orchestrator-Marker fixen (T901311)

## Symptom vs. Ursache (T002448-M5)

- **Symptom (Fakt, RED-Beleg):** jeder `runOrchestrator`-Lauf pusht
  `{kind:'protocol_error'}` — neuer Regressionstest
  `tests/spec/agent-bench/orchestrator-marker.bats` ("Sauberer Dispatch trägt
  kein protocol_error") ist rot: `unexpected protocol_error:
  ["protocol_error"]` bei sauberem Dispatch mit Outcome 1.
- **Ursache (Hypothese + Evidenz):** `orchestrator.mjs:38` prüft
  `res.stdout.includes(RESULT_MARKER)` mit `RESULT_MARKER =
  'PLAN-RUNNER-RESULT:'` (`plan.mjs:8`). Das ist der **Worker**-Ergebnis-Marker
  (Worker-Output, `parseResult`, `buildWorkerPrompt:120-122`). Der
  **Runner** schreibt seine Summary dagegen als `PLAN-RUNNER: done=...`
  (`plan-runner.mjs:397`) nach stdout — der geprüfte Marker kann dort nie
  stehen. Code-Evidenz: `grep -n "RESULT_MARKER\|PLAN-RUNNER"
  scripts/llm/agent-bench/lib/roles/orchestrator.mjs
  scripts/llm/plan-runner.mjs` (Beleg im Ticket).

## Brainstorming (Optionen)

1. **Runner-Summary prüfen (GEWÄHLT):** Check auf `'PLAN-RUNNER:'`-Präfix im
   stdout umstellen; `RESULT_MARKER`-Import entfernen (in orchestrator.mjs
   sonst ungenutzt). Eine Zeile, Semantik sauber getrennt (Runner vs. Worker).
2. **Runner emits zusätzlich `PLAN-RUNNER-RESULT:`:** verworfen — würde
   Worker-Semantik in die Runner-Summary lekken und `parseResult`-Konsumenten
   verwirren.
3. **stdout+stderr prüfen:** verworfen — Summary geht deterministisch nach
   stdout (`process.stdout.write`), Logs nach stderr; stdout-Check genügt.

## Design

- `scripts/llm/agent-bench/lib/roles/orchestrator.mjs`: Konstante
  `RUNNER_MARKER = 'PLAN-RUNNER:'`, Check
  `if (!res.stdout.includes(RUNNER_MARKER)) events.push({kind:
  'protocol_error'})`; Import-Zeile auf `statePath` reduzieren. Exit-Code-Check
  (`![0,1].includes(res.code)`) unverändert.
- `tests/spec/agent-bench/orchestrator-marker.bats` (neu, RED liegt vor):
  sauberer Dispatch → kein `protocol_error`.
- Bestehende `orchestrator-dispatch.bats`-Assertions (Abwesenheit anderer
  Events) bleiben unverändert grün.

## Prior-Art

- `plan.mjs:8,120-137` (Worker-Marker + parseResult), `plan-runner.mjs:397`
  (Runner-Summary), `orchestrator.mjs:37-38` (Doppel-Check), `_shared.mjs:47-65`
  (`run()` liefert stdout/stderr getrennt). Keine ADR zum Marker.

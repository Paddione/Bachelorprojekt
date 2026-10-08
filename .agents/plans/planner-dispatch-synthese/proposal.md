# Proposal: Planner-Dispatch + Synthese messen (T901309)

## Ausgangslage (User-Entscheidung 2026-10-08)

Rollenvertrag: Thinking orchestriert (mehrere Instruct-Worker-Instanzen
tragen Stufenpläne aus), Instruct führt aus (T901286 deckt Worker-Seite:
41/42). Die Orchestrator-Mechanik existiert
(`orchestrator.mjs` → plan-runner mit `--4b-slots`; Events `self_exec`,
`accepted_faulty_result`, `redelegate_without_cause`), aber
`tests/spec/agent-bench/scoring.bats` misst nur Planner-Entscheidungen
(6 Tests: determinism, detour, clarify, false-pass, rejection, case-shape).
Dispatch-Disziplin und Synthese mehrerer Worker-Ergebnisse sind unvermessen.

## Brainstorming (Optionen)

1. **Varianten am bestehenden Gate (GEWÄHLT)**: neue agent-bench-Cases
   (`cases/f5-*`, `f6-*`: Multi-Partial mit Worker-Slots, faulty-worker mit
   Retry-Pflicht, Synthese aller Partials) + BATS-Coverage über
   `drive-role.mjs`-Fixture mit geskriptetem `fake-openai.mjs`.
   Kein neues Harness, keine Prod-Code-Architekturänderung.
2. **Dispatch-Tool im Planner**: verworfen — Dispatch gehört in
   plan-runner/Orchestrator (existiert), nicht in die Planer-Rolle.
3. **Neues Thinking-Finetune-Set**: verworfen — Thinking-Seite ist
   Orchestrierungs-Verhalten zur Laufzeit, kein SFT-Scoring-Problem.

## Design

- `scripts/llm/agent-bench/cases/f5-dispatch-clean/`: Referenzplan mit ≥3
  disjunkten Partials + Checks; Variante `expected_decision: execute`,
  `slots4b: 2`. Pass-Kriterium: alle Partials `done`, kein `self_exec`,
  Checks grün → outcome 1.
- `cases/f6-faulty-worker/`: ein Partial liefert faulty result; Pass:
  `accepted_faulty_result` fehlt (Retry mit Ursachen-Notiz, kein
  `redelegate_without_cause`).
- `cases/f7-synthesis/`: Pass erst bei vollständigem Synthese-Nachweis
  (alle Partials done + Checks grün, Teilgrün → Teil-Outcome wie bisher).
- `tests/spec/agent-bench/orchestrator-dispatch.bats` (neu): drei
  drive-role-Läufe mit Fake-Skripten (sauberer Dispatch / faulty-Retry /
  Selbstausführung → `self_exec` + outcome 0). Kein externes Binary nötig
  (node + fake-openai wie `scoring.bats`); keine neuen CI-Anforderungen.

## Prior-Art

- `lib/roles/planner.mjs:122-125` (clarify-Gate), `orchestrator.mjs:44-54`
  (Dispatch-Events), `cases.mjs` (ROLES/Perspektiven inkl. `faulty-worker`),
  `scoring.bats:48-79` (Fake-Muster). Keine ADR zum Orchestrator-Gate.

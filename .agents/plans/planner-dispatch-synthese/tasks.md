---
title: "Planner-Dispatch und Synthese messen"
ticket_id: T901309
domains: [agent-bench, tests]
status: active
file_locks: [scripts/llm/agent-bench/cases/f5-dispatch-clean, scripts/llm/agent-bench/cases/f6-faulty-worker, scripts/llm/agent-bench/cases/f7-synthesis, tests/spec/agent-bench/orchestrator-dispatch.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# planner-dispatch-synthese — Implementation Plan

Dispatch-Disziplin und Synthese mehrerer Worker-Instanzen am bestehenden
agent-bench-Gate messen (Rollenvertrag 2026-10-08, T901309). Design und
verworfenene Optionen in `proposal.md`.

## File Structure

- `scripts/llm/agent-bench/cases/f5-dispatch-clean/` (neu): Referenzplan
  (tasks.md + Partials, disjunkte target_files), Checks-Verzeichnis,
  Varianten-JSON (`expected_decision: execute`, `slots4b: 2`).
- `scripts/llm/agent-bench/cases/f6-faulty-worker/` (neu): wie f5, aber ein
  Partial mit faulty result; Variante verlangt Retry mit Ursachen-Notiz.
- `scripts/llm/agent-bench/cases/f7-synthesis/` (neu): Variante verlangt
  Vollsynthese (alle Partials done + Checks grün).
- `tests/spec/agent-bench/orchestrator-dispatch.bats` (neu): drei
  drive-role-Läufe (`$FIX/drive-role.mjs` + geskriptetes `fake-openai.mjs`
  nach `scoring.bats`-Muster): sauberer Dispatch → outcome 1 ohne
  `self_exec`; faulty → Retry ohne `accepted_faulty_result`;
  Selbstausführung → `self_exec` + outcome 0.

## Quality budgets

`.mjs`-Fixtures und `.bats` ohne S1-Limits; Case-Verzeichnisse sind Daten,
kein Code. S2: keine TS-Imports (reines Node + BATS wie Bestand). S3: keine
Brand-Literale. S4: Cases über `cases.mjs`-Loader erreichbar, BATS über
`task test:changed`. Test-Inventar nur via `task test:inventory`
aktualisieren (generiert, nie von Hand).

## Tasks

- [ ] **1. Failing-Test schreiben und expected FAIL beobachten.**
  `orchestrator-dispatch.bats` mit erstem Dispatch-Fall anlegen und per
  `tests/unit/lib/bats-core/bin/bats` laufen lassen — expected FAIL
  (Cases f5–f7 fehlen, Loader lehnt ab); danach Cases nachziehen bis grün.
- [ ] **2. Cases f5/f6/f7 anlegen.** Referenzpläne mit disjunkten Partials,
  Checks und Varianten-JSON nach `cases.mjs`-Konvention (Splits/Perspektiven
  beachten); `slots4b: 2` in f5; faulty-Artefakt in f6.
- [ ] **3. Dispatch-BATS vervollständigen.** Alle drei Läufe grün fahren
  (Fake-Skripte je Szenario); bestehende `scoring.bats`-Fälle weiter grün.
- [ ] **4. Verify: Suite + Inventar.** Volle `agent-bench/`-Suite grün,
  `task test:changed`; danach `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`.

---
title: "Orchestrator-Marker fixen"
ticket_id: T901311
domains: [agent-bench, tests]
status: active
file_locks: [scripts/llm/agent-bench/lib/roles/orchestrator.mjs, tests/spec/agent-bench/orchestrator-marker.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# orchestrator-marker — Implementation Plan

Falscher Marker-Check im Orchestrator: Runner-Summary (`PLAN-RUNNER:`)
statt Worker-Marker (`PLAN-RUNNER-RESULT:`) pruefen. Begruendung, verworfene
Optionen und Evidenz in `proposal.md` (Bug T901311).

## File Structure

- `scripts/llm/agent-bench/lib/roles/orchestrator.mjs` (60 Zeilen, kein
  S1-Baseline-Eintrag): Import auf `statePath` reduzieren, Konstante
  `RUNNER_MARKER = 'PLAN-RUNNER:'`, Zeile 38 auf Runner-Summary umstellen.
  Delta <10 Zeilen.
- `tests/spec/agent-bench/orchestrator-marker.bats` (neu, RED belegt):
  sauberer Dispatch via `drive-role.mjs` + fake-openai/Dispatch-Stub nach
  `orchestrator-dispatch.bats`-Muster; assert: kein `protocol_error`.

## Quality budgets

Keine geaenderte Datei in `docs/code-quality/baseline.json` — keine
S1-Schwelle. `.mjs`-Delta <10 Zeilen, `.bats` neu ohne Limits. S2: keine
TS-Imports. S3: keine Brand-Literale. S4: neuer Test ueber
`tests/unit/lib/bats-core/bin/bats` und `task test:changed` erreichbar.
Kein externes Binary (node + fake-openai wie Bestand). Keine
Ignore-Ausnahme.

## Tasks

- [ ] **1. Failing-Test RED belegen (erledigt, verifizieren).**
  `orchestrator-marker.bats` per `tests/unit/lib/bats-core/bin/bats`
  laufen lassen — expected FAIL (`unexpected protocol_error`) bestaetigen.
- [ ] **2. Marker-Check fixen.** `orchestrator.mjs`: `RUNNER_MARKER =
  'PLAN-RUNNER:'`, stdout-Check umstellen, `RESULT_MARKER`-Import entfernen.
- [ ] **3. GREEN fahren.** Neue BATS-Datei gruen; volle `agent-bench/`-Suite
  gruen (insb. `orchestrator-dispatch.bats`, `scoring.bats`); `task
  test:changed`.
- [ ] **4. Verify: Freshness + Kette.** `task freshness:regenerate`,
  Artefakte committen, `task freshness:check`, `assert-phase-chain`
  (verify:done nach Gruen backfillen falls noetig).

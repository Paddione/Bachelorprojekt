---
title: "plan-db-ssot — Implementation Plan"
ticket_id: T901719
domains: [sdlc, tickets, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-db-ssot — Implementation Plan

Plan-Bodies werden ab Stage-Zeitpunkt in Postgres (`tickets.ticket_plans.content`)
geschrieben; die Datei unter `.agents/plans/` bleibt Authoring-Surface für
Lint/Review, die DB wird SSOT. Keine neue Tabelle, keine Migration:
Prior-Art T900999 (Lifecycle Receipt) nutzt `ticket_plans` bereits für den
Post-Merge-Receipt — dieser Plan verlegt den Schreibzeitpunkt auf `stage-plan`
und macht Archivierung idempotent per UPDATE.

_Ticket: T901719_

Entscheidungen aus dem Brainstorming: D1 `ticket_plans` wiederverwenden
(Staged-Row: `pr_number` NULL + Stage-Trailer; Archived-Row: `pr_number`
gesetzt oder Merged-Trailer). D2 T002471-M6-Guard (committed Datei) und
`plan-lint` bleiben unverändert — Datei ist Cache, DB ist SSOT. D3
`archive-plan`/`finalize` werden UPDATE-statt-INSERT bei existierender
Staged-Row. D4 `plan-get` und Runner-Fallback sind fail-closed und schreiben
nie in Worktrees (Materialisierung nur nach `$TMPDIR`).

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/vda/ticket/stage-plan.sh` | 190 | 610 |
| `scripts/vda/ticket/plan-get.sh` | 0 (neu) | 800 |
| `scripts/ticket.sh` | 1012 | -212 |
| `scripts/llm/plan-runner.mjs` | 401 | 399 |
| `scripts/devflow-post-merge-finalize.sh` | 456 | 356 |
| `tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py` | 54 | 746 |
| `tests/py/spec/native_ported/spec/test_plan_lifecycle.py` | 142 | 658 |
| `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_ticket_ref.py` | 130 | 670 |
| `.agents/skills/references/ticket-stage-procedure.md` | 126 | – |

Budget-Quelle: `yq '.s1.limits' docs/code-quality/gates.yaml` (`.sh`/`.mjs`
800, `.py` 800); Baseline aus `docs/code-quality/baseline.json`. Nur
`scripts/devflow-post-merge-finalize.sh` ist gebaselined (812, wirksame
Schwelle, Rest 356). `scripts/ticket.sh` ist S1-per-ignore-glob sanktionierte
Single-File-CLI (`gates.yaml`), wächst hier nur um Dispatcher-Zeilen;
`plan-get.sh` ist als von `ticket.sh` gesourctes Modul S4-erreichbar.
`.md` hat kein S1-Limit (kein Zahlen-Budget behauptet).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-stage-write.md | Stage-Write | `scripts/vda/ticket/stage-plan.sh` |  |
| p2 | tasks.d/p2-read-path.md | Read-Path | `scripts/vda/ticket/plan-get.sh`, `scripts/ticket.sh`, `scripts/llm/plan-runner.mjs`, `scripts/devflow-post-merge-finalize.sh` | p1 |
| p3 | tasks.d/p3-tests-docs.md | tests | `tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py`, `tests/py/spec/native_ported/spec/test_plan_lifecycle.py`, `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_ticket_ref.py`, `.agents/skills/references/ticket-stage-procedure.md` | p1, p2 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst.** Erweitere
  `tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py`
  um einen Stub-Test, der nach `stage-plan` eine `ticket_plans`-Row mit dem
  Plan-Body erwartet. Führe aus:
  `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py -q`
  — expected: FAIL, solange p1 nicht implementiert ist (der `pytest`-Lauf über
  `pytest-run.sh` ist der Testrunner-Nachweis).
- [ ] **1. Partial p1 implementieren** (`tasks.d/p1-stage-write.md`):
  Stage-Write in `stage-plan.sh`, dann denselben pytest-Befehl aus Task 0 —
  jetzt grün.
- [ ] **2. Partial p2 implementieren** (`tasks.d/p2-read-path.md`): neues
  `plan-get.sh`-Modul, Dispatcher-Verdrahtung und Archive-Upsert in
  `ticket.sh`, DB-Fallback in `plan-runner.mjs`, Update-statt-Skip in
  `devflow-post-merge-finalize.sh`.
- [ ] **3. Partial p3 implementieren** (`tasks.d/p3-tests-docs.md`):
  Lifecycle- und Runner-Tests, Backfill offener `plan_staged`-Tickets,
  Referenz-Doku.
- [ ] **4. Finaler Verifikations-Task.** Führe in dieser Reihenfolge aus:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei müssen grün sein; `freshness:check` deckt `quality:check`
  (S1–S4-Ratchet) und die Baseline-Key-Assertion ab.

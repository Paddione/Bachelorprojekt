---
title: "post-cleanup-repairs — Implementation Plan"
ticket_id: T901749
domains: [scripts, tickets, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# post-cleanup-repairs — Implementation Plan

Zwei Defekte aus dem Plan-Cleanup, je mit failing-test-first belegt. Beide
Fixes sind klein, disjunkt und fail-closed.

_Ticket: T901749_

Root-Cause-Analyse (Symptom vs. Ursache getrennt): Bug A — Symptom (Fakt):
`turbolint.py` ohne `--plan` endet mit Exit 2 und stale Meldung `plan file
missing: .agents/plans/llm-proxy-devflow-tools/tasks.md`. Ursache (belegt):
`DEFAULT_PLAN` (Zeile 32) zeigt auf den per #6492 geloschten Pfad; der
Fallthrough in Zeile 268 nutzt den toten Default. Bug B — Symptom (Fakt,
live beobachtet an T901719): Re-Archive auf archivierter Row legte eine
zweite Row an (per gezieltem DELETE repariert). Ursache (belegt): der
Upsert-Check aus T901719 zahlt nur `pr_number IS NULL`-Rows; archivierte
Rows fallen zu INSERT durch. Reproducer je Bug liegen als Rot-Tests vor.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/devflow/turbolint.py` | 281 | 519 |
| `scripts/ticket.sh` | 1040 | -240 |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py` | 216 | 584 |
| `tests/py/spec/native_ported/spec/test_plan_lifecycle.py` | 241 | 559 |

Budget-Quelle: `yq '.s1.limits' docs/code-quality/gates.yaml` (`.py`/`.sh`
800); keine der vier Dateien ist gebaselined, wirksame Schwelle ist das
statische Limit. `scripts/ticket.sh` ist S1-per-ignore-glob sanktionierte
Single-File-CLI und wachst nur um wenige Zeilen im Upsert-Check.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-turbolint.md | impl | `scripts/devflow/turbolint.py` |  |
| p2 | tasks.d/p2-archive-upsert.md | impl | `scripts/ticket.sh` |  |
| p3 | tasks.d/p3-tests.md | tests | `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py`, `tests/py/spec/native_ported/spec/test_plan_lifecycle.py` | p1, p2 |

## Tasks

- [ ] **0. Rotphase (liegt vor, beide rot):** Beide failing Tests sind
  geschrieben und rot bestatigt — Details und `expected: FAIL`-Nachweis in
  `tasks.d/p3-tests.md`. Kein neuer Testdatei-Pfad (bestehende Dateien
  erweitert).
- [ ] **1. Partial p1 implementieren** (`tasks.d/p1-turbolint.md`):
  `--plan`-Pflicht in `turbolint.py`; danach Turbolint-Rot-Test grun.
- [ ] **2. Partial p2 implementieren** (`tasks.d/p2-archive-upsert.md`):
  voller Upsert je Ticket+Slug in `cmd_archive_plan`; danach
  Archive-Rot-Test grun, keine Duplikat-Row.
- [ ] **3. Partial p3 abschliessen** (`tasks.d/p3-tests.md`): bestehende
  T901719-Tests auf vereinheitlichte Count-Semantik nachziehen, beide
  Dateien vollstandig grun.
- [ ] **4. Finaler Verifikations-Task.** Fuhre in dieser Reihenfolge aus:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei mussen grun sein; bekannte Umwelt-Ausschlusse (Write-Guard
  Regel-1 nur-Main, pre-existing ENV-Fails) sind im Ausfuhrungsreport zu
  belegen, nicht zu raten.

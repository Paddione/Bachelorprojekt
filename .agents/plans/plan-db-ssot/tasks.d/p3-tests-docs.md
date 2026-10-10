---
title: "p3-tests-docs — Lifecycle-Tests, Backfill, Referenz-Doku"
ticket_id: T901719
domains: [sdlc, tickets, scripts]
status: draft
---

# plan-db-ssot — Implementation Plan

Partial-Plan `p3-tests-docs` für T901719 (Slug `plan-db-ssot`).
Scope: Tests (bestehende Dateien erweitern, keine neuen Testdateien),
Backfill offener `plan_staged`-Tickets, Referenz-Doku. Zieldateien sind
exklusiv; dieser Partial ändert keine weiteren Dateien.

## File Structure

| Datei | Ist | Budget |
| `tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py` | 54 | 746 |
| `tests/py/spec/native_ported/spec/test_plan_lifecycle.py` | 142 | 658 |
| `tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_ticket_ref.py` | 130 | 670 |
| `.agents/skills/references/ticket-stage-procedure.md` | 126 | – |

Budget-Quelle: `.py`-Limit 800 aus `docs/code-quality/gates.yaml`, alle
drei Testdateien nicht-baselined. `.md` hat kein S1-Limit (kein
Zahlen-Budget behauptet). Keine neue Testdatei → kein
`test-inventory`-Eintrag nötig.

## Task 5 — Tests erweitern

Steps:

1. `test_stage_plan_contract.py`: Rotphase zuerst — Stub-Test schreiben, der
   nach `stage-plan` eine Staged-Row mit Body + Stage-Trailer erwartet, Lauf:
   `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py -q`
   — expected: FAIL vor p1, grün nach p1; danach kein Duplikat bei
   Wiederholung absichern.
2. `test_plan_lifecycle.py`: Fälle für Archive-Upsert (eine Row nach
   Stage+Archiv) und Finalize-Update (Evidenz + Merge-SHA in bestehender
   Row, kein Skip bei Staged-Row) ergänzen, Fixture-Muster der Datei
   übernehmen.
3. `test_plan_runner_ticket_ref.py`: Fallback-Fall ergänzen (kein Worktree,
   `PLAN_RUNNER_TICKET_JSON`-Seam + `plan-get`-Stub liefern Body →
   `tasks.md` unter `$TMPDIR` materialisiert) sowie Negativ-Fall (keine
   Row → Exit 2).

Akzeptanzkriterien:

- Alle drei Dateien laufen grün:
  `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/dev-flow-plan/test_stage_plan_contract.py tests/py/spec/native_ported/spec/test_plan_lifecycle.py tests/py/spec/native_ported/spec/llm-local-dev/test_plan_runner_ticket_ref.py -q`
- Kein neuer Testdatei-Pfad angelegt (Inventar unverändert).

## Task 6 — Backfill und Doku

Steps:

1. Backfill: für jedes Ticket mit Status `plan_staged` den referenzierten
   Body per bestehendem `ticket.sh archive-plan --reason staged-backfill`
   als Row sichern; danach Verify-Count (`SELECT count(*)` pro Ticket
   mindestens 1). Einmaliger manueller Schritt, kein neues Skript.
2. `.agents/skills/references/ticket-stage-procedure.md`: Abschnitt
   „DB-SSOT (T901719)" ergänzen — Stage schreibt Body, Datei ist Cache,
   `plan-get`-Lesepfad, Upsert-Semantik.

Akzeptanzkriterien:

- Jedes offene `plan_staged`-Ticket hat mindestens eine `ticket_plans`-Row.
- Die Referenz beschreibt Stage-Write, `plan-get` und Upsert korrekt.

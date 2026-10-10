---
title: "p3-tests — Rot-Tests und Stub-Nachzug"
ticket_id: T901749
domains: [scripts, tickets, testing]
status: draft
---

# post-cleanup-repairs — Implementation Plan

Partial-Plan `p3-tests` fur T901749 (Slug `post-cleanup-repairs`). Scope:
Rot-Tests (liegen vor) und Nachzug bestehender Tests auf die
vereinheitlichte Count-Semantik. Zieldateien sind exklusiv; keine neuen
Testdatei-Pfade (kein Test-Inventar-Eintrag notig).

## File Structure

| Datei | Ist | Budget |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py` | 216 | 584 |
| `tests/py/spec/native_ported/spec/test_plan_lifecycle.py` | 241 | 559 |

Budget-Quelle: `.py`-Limit 800 aus `docs/code-quality/gates.yaml`, beide
nicht-baselined. Nur Test-Code, wenige Zeilen je Datei.

## Task 0 — Rotphase (belegt)

Beide failing Tests sind geschrieben und rot bestatigt — expected: FAIL
vor dem Fix, grun danach. Testrunner ist `pytest` via
`bash scripts/pytest-run.sh`:

1. `test_devflow_turbolint_ohne_plan_flag_verlangt_plan`
   (`test_devflow_backend.py`): Aufruf ohne `--plan` muss Exit 2 mit
   `--plan is required` liefern; aktuell kommt die stale
   `plan file missing`-Meldung auf toten Default.
2. `test_t901749_archive_auf_archivierter_row_updatet_statt_duplikat`
   (`test_plan_lifecycle.py`, `kubectl`-Stub): Re-Archive bei
   archivierter Row muss UPDATE liefern; aktuell kommt INSERT.

## Task 3 — Bestehende T901719-Tests nachziehen

Steps:

1. `test_t901719_archive_ohne_staged_row_insertet`: `KUBECTL_TOTAL_COUNT`
   auf `0` setzen — der vereinheitlichte Check zahlt jetzt alle Rows,
   der Frisch-Fall braucht explizit null.
2. `test_t901719_archive_mit_staged_row_updatet_statt_duplikat`:
   `KUBECTL_STAGED_COUNT` durch `KUBECTL_TOTAL_COUNT=1` ersetzen (der
   `IS NULL`-Zweig entfallt im Produkt-Code, der Stub-Ast bleibt aus
   Kompatibilitat bestehen).
3. Beide Dateien vollstandig laufen lassen:
   `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py tests/py/spec/native_ported/spec/test_plan_lifecycle.py -q`
   — alles grun, keine Deselektierung.

Akzeptanzkriterien:

- Beide Rot-Tests aus Task 0 sind grun.
- Alle ubrigen Tests beider Dateien bleiben grun.
- Kein neuer Testdatei-Pfad angelegt (Inventar unverandert).

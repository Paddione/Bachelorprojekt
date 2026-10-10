---
title: "p1-turbolint — --plan erforderlich statt toter Default"
ticket_id: T901749
domains: [scripts, testing]
status: draft
---

# post-cleanup-repairs — Implementation Plan

Partial-Plan `p1-turbolint` fur T901749 (Slug `post-cleanup-repairs`).
Scope: `--plan`-Pflicht in `turbolint.py`. Zieldatei ist exklusiv; dieser
Partial andert keine weiteren Dateien.

## File Structure

| Datei | Ist | Budget |
| `scripts/devflow/turbolint.py` | 281 | 519 |

Budget-Quelle: `.py`-Limit 800 aus `docs/code-quality/gates.yaml`,
nicht-baselined. Anderung wenige Zeilen (Default entfernen, Guard +
Meldung), Endstand deutlich unter dem Limit.

## Task 1 — --plan erforderlich machen

Steps:

1. `DEFAULT_PLAN`-Konstante und ihren Fallthrough in `main()` entfernen;
   `run()`-Signatur auf `plan=None` umstellen (einziger Aufrufer ist
   `main()` mit explizitem Wert, keine externen Aufrufer).
2. Fehlt `--plan` und enthalt stdin kein `plan`-Feld: klare Meldung auf
   stderr — exakter Text: `--plan is required (default plan removed;
   staged plans live in tickets.ticket_plans — use ticket.sh plan-get)` —
   und Exit 2 (fail-closed, Exit-Konvention wie bisher).
3. `--help`-Text der `--plan`-Option anpassen (Pflicht statt Default).

Akzeptanzkriterien:

- Aufruf ohne `--plan` und ohne stdin-Plan: Exit 2 mit der neuen Meldung.
- Aufruf mit `--plan` (Datei vorhanden oder fehlend) verhalt sich wie
  bisher (Lint-Lauf bzw. `plan file missing`-Fehler mit Exit 2).
- `test_devflow_turbolint_ohne_plan_flag_verlangt_plan` ist grun, alle
  ubrigen Tests der Datei bleiben grun.

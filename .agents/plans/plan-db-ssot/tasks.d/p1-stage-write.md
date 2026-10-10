---
title: "p1-stage-write — Stage-Write nach ticket_plans"
ticket_id: T901719
domains: [sdlc, tickets, scripts]
status: draft
---

# plan-db-ssot — Implementation Plan

Partial-Plan `p1-stage-write` für T901719 (Slug `plan-db-ssot`).
Scope: `stage-plan` schreibt den Plan-Body zusätzlich nach
`tickets.ticket_plans` (Staged-Row). Zieldatei ist exklusiv; dieser Partial
ändert keine weiteren Dateien.

## File Structure

| Datei | Ist | Budget |
| `scripts/vda/ticket/stage-plan.sh` | 190 | 610 |

Budget-Quelle: `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`;
nicht-baselined, wirksame Schwelle ist das statische Limit. Wachstum um
etwa 40 Zeilen bleibt deutlich unter dem Limit.

## Task 1 — Staged-Row in stage-plan.sh schreiben

Steps:

1. Nach dem bestehenden T002471-M6-Guard (Datei committed auf Branch/HEAD)
   den Plan-Body per `git show ${branch}:${plan}` lesen (ersetze keinen
   bestehenden Lese-Pfad, füge nur den DB-Schritt an).
2. Body + Stage-Trailer
   `<!-- plan-stage branch=<b> plan=<pfad> -->` per `_exec_sql_with_timeout`
   nach `tickets.ticket_plans (ticket_id, slug, branch, content, pr_number)`
   schreiben; `slug` aus dem Plan-Pfad ableiten (Verzeichnisname unter
   `.agents/plans/`), `pr_number` NULL.
3. Idempotenz: vor dem INSERT per `SELECT count(*)` prüfen, ob für
   `(ticket_id, slug)` bereits eine Staged-Row (`pr_number IS NULL`)
   existiert — dann UPDATE des Contents statt zweitem INSERT.
4. Verify-Count wie in `archive-plan` (count mindestens 1), sonst
   `ERROR: stage-plan DB write failed` und Exit 1 (fail-closed: kein
   `plan_staged`-Status ohne verifizierte Row).

Akzeptanzkriterien:

- Nach `stage-plan --hold` existiert genau eine Staged-Row mit vollständigem
  Body und Stage-Trailer.
- Zweiter `stage-plan`-Lauf für dasselbe Ticket erzeugt keine Duplikat-Row.
- `plan-lint` und T002471-M6-Verhalten sind unverändert (Datei bleibt
  Authoring-Surface).

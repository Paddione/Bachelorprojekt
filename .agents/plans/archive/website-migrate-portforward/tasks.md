---
title: website:migrate Port-Forward-Diagnose härten und Runner-Tod fixen
ticket_id: T901789
domains: [website, taskfile, ci]
status: staged
---

# website-migrate-portforward — Implementation Plan

Single-Plan (kleine Änderung, ein Task + Tests). Root-Cause-Analyse und
Entscheidungen: `design.md` im selben Ordner. Der Runner-Vorfall aus
Run 38070460176 ist per Stub-Harness hermetisch reproduziert.

## File Structure

| Datei | Änderung |
|---|---|
| `taskfiles/Taskfile.web.yml` | Diagnose-Härtung (D1–D4) + Befund-Fix (F) im Task `website:migrate` |
| `.github/workflows/post-merge.yml` | Lesekontext; Änderung nur falls Stufe R einen Workflow-Canary verlangt |
| `tests/py/spec/website-migrate/test_portforward_runner.py` | RED-Test (neu, bereits im Branch, ca. 120 Zeilen) |
| `components/website/src/data/test-inventory.json` | Regenerieren falls verändert |

`taskfiles/Taskfile.web.yml` und `.github/workflows/post-merge.yml` sind
nicht S1-vermessen (kein `.yml`-Limit, beide unbaselined); das neue
pytest-Modul bleibt deutlich unter dem `.py`-Limit von 800. Keine
`website/src`-Änderung, daher kein Vitest- und kein CQ02-Task.

## Task 1 — RED-Bestätigung

- Step: `PYTEST_JOBS=0 bash scripts/pytest-run.sh tests/py/spec/website-migrate/test_portforward_runner.py` — expected: FAIL, der Diagnose-Test rot, der Fail-Closed-Guard grün.
- Acceptance: exakt 1 failed / 1 passed; Fail-Grund ist die fehlende
  `exit code`-Zeile in der Task-Ausgabe, alle Positiv-Anker bestehen.

## Task 2 — Diagnose-Härtung in `taskfiles/Taskfile.web.yml`

Im Task `website:migrate` den Forward-Tod auskunftsfähig machen (Vertrag
für den RED-Test aus Task 1):

- D1 Exit-Code sichern: nach `kill -0`-Tod per `wait` den Status holen
  (`PF_CODE=0; wait $PF || PF_CODE=$?` — `set -e`-fest) und die Zeile
  `port-forward exit code: $PF_CODE` drucken.
- D2 Client-Version drucken: `kubectl $ctx_flag version --client`
  (best-effort mit `|| true`, damit die Diagnose nie selbst failt).
- D3 PF-Log mit Markern drucken (`port-forward log begin` /
  `port-forward log end`); bei leerem Log zusätzlich die Zeile
  `port-forward log empty (no output before exit)`.
- D4 Zielauflösung drucken: `kubectl $ctx_flag -n "$NS" get svc shared-db`
  (best-effort mit `|| true`).
- Constraints: T901750-Verträge bleiben unangetastet (ephemerer `:5432`-Port,
  TCP-Verify, Fail-Closed, `Migrate target`-Echo); kein neues Skript (S4);
  kein fester Port; Secrets-Fallback (exec-Pfad) unberührt.
- Acceptance: `test_portforward_death_reports_actionable_diagnostics` und
  `test_failed_forward_never_runs_migration` sind beide grün.

## Task 3 — Ursachen-Repro und Forward-Fix

Stufen R + F aus `design.md`, Befund-gestützt statt geraten:

- R1: `kubectl --context fleet -n workspace auth can-i create pods/portforward`
  (H1 RBAC prüfen).
- R2: `kubectl --context fleet -n workspace get svc shared-db -o wide`
  (H3 Service-Port prüfen).
- R3: lokale kubectl-Client-Version gegen die D2-Zeile aus Task 2 halten und
  die `:5432`-Syntax gegen diese Version verifizieren (H2).
- Befund als Ticket-Kommentar an T901789 ablegen (Hypothese bestätigt oder
  verworfen, jeweils mit Kommando-Evidenz).
- F: Fix aus dem Befund umsetzen — je nach Befund RBAC-Antrag an den
  Fleet-Admin, expliziter Loopback-Bind, Pod-Direkt-Forward statt
  Service-Forward oder Retry mit Backoff. `.github/workflows/post-merge.yml`
  nur anfassen, falls der Befund einen Workflow-Canary verlangt.
- Acceptance: Befund-Kommentar liegt am Ticket; Fix umgesetzt; beide Tests
  aus Task 1 grün; `task -n website:migrate ENV=mentolder` rendert.

## Task 4 — Alternativpfad-Inventar (Ticket-Frage 2)

- Alle Prod-Migrate-Wege inventarisieren: Aufrufer von `website:migrate`
  (post-merge-Workflow, Taskfile-Abhängigkeiten), Flux-Jobs/CronJobs mit
  `db:migrate`, dokumentierte Operator-Runs.
- Gap seit #6504 bewerten: welche Migrationen wurden seitdem gemergt, lief
  davon je eine in Prod (schema_migrations-Stand Prod gegen Repo halten)?
- Ergebnis (Inventar + Gap-Urteil) als Ticket-Kommentar an T901789 ablegen.
  Ist post-merge der einzige Weg und der Task-3-Fix unsicher, zusätzlich
  den Eskalationspfad dokumentieren (manueller Operator-Run mit
  Fleet-KUBECONFIG vom Dev-Host).
- Acceptance: Inventar und Gap-Urteil liegen als Ticket-Kommentar vor.

## Task 5 — Verify

- Steps:
  - `bash scripts/pytest-run.sh tests/py/spec/website-migrate/test_portforward_runner.py` (grün)
  - `task test:changed`
  - `task test:inventory` falls Test-Inventar betroffen, Artefakt mitcommitten
  - `task freshness:regenerate`
  - Artefakte committen
  - `task freshness:check`
- Acceptance: alle drei Kommandos `task test:changed`,
  `task freshness:regenerate`, `task freshness:check` laufen erfolgreich.

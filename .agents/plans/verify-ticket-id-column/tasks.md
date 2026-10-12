---
title: verify-ticket-id fragt existierende id-Spalte statt uuid ab
ticket_id: T901953
domains: [ticket-system, gates]
status: staged
---

# verify-ticket-id-column — Implementation Plan

Single-Plan (ein Skript + Tests). Ursache belegt: `scripts/verify-ticket-id.sh`
fragt `SELECT uuid::text FROM tickets.tickets` ab, die Spalte heisst `id`
(verifiziert 12.10. via `information_schema`). Folge: Exit 1 für jede
existierende ID — der T002371-Guard ist wirkungslos. Beobachtet beim
Triage-Write zu T901952 (4/4 IDs fälschlich REJECTED, Zweitquellen-SELECT
mit `id` ok).

Fix: `uuid::text` zu `id::text`. Regressionsschutz: neuer pytest mit
kubectl-Stub, der die `information_schema`-Wahrheit emuliert (Spalte `id`
existiert, `uuid` nicht) — vor dem Fix rot, danach grün.

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/verify-ticket-id.sh` | `uuid::text` zu `id::text` |
| `tests/py/spec/ticket-system/test_verify_ticket_id.py` | Neu: kubectl-Stub + 2 Tests (OK-Pfad RED, REJECTED-Pfad Pin) |
| `components/website/src/data/test-inventory.json` | Regenerieren (neue Testdatei) |

`scripts/verify-ticket-id.sh` hat Ist 30 bei Restbudget 766.
`tests/py/spec/ticket-system/test_verify_ticket_id.py` ist neu (ca. 75) bei Restbudget 728.
Beide Dateien liegen weit unter ihrer wirksamen Schwelle, kein Split nötig.

## Task 1 — RED-Bestätigung

- Step: `python3 -m pytest tests/py/spec/ticket-system/test_verify_ticket_id.py -q` — expected: FAIL, beide Tests rot.
- Acceptance: `test_bekannte_id_ist_ok` scheitert (Exit 1 statt 0);
  `test_unbekannte_id_ist_rejected` scheitert ebenfalls (Skript stirbt per
  `set -e` am psql-Fehler, bevor es REJECTED druckt — leere Ausgabe).

## Task 2 — Spaltenname korrigieren

- In `scripts/verify-ticket-id.sh` die Abfrage auf `SELECT id::text ...`
  korrigieren. Keine weiteren Änderungen (Meldungen, Exit-Codes bleiben).
- Acceptance: `bash -n scripts/verify-ticket-id.sh` ist grün,
  `python3 -m pytest tests/py/spec/ticket-system/test_verify_ticket_id.py -q`
  meldet 2/2 grün, und `bash scripts/verify-ticket-id.sh T901952 mentolder`
  meldet OK gegen den echten Cluster.

## Task 3 — Verifikation und Inventar

- Step: `task test:changed`
- Step: `task test:inventory` nach der Test-Änderung, danach
  `components/website/src/data/test-inventory.json` mitcommitten.
- Step: `task freshness:regenerate`
- Step: `task freshness:check`
- Acceptance: alle Verify-Kommandos grün, Inventar committet.

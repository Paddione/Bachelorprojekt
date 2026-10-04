---
id: P4
role: impl
ticket: T900999
depends_on: P1
target_files:
  - scripts/ticket.sh
---

# P4: Staged- und Superseded-Regel (archive-plan erweitern)

## Ziel

Staged Plaene (>N Tage inaktiv, Vorschlag N=14, final in Phase A)
und supersedete Plaene (bei Nachfolger-Merge) fallen unter dieselbe
Receipt+Delete-Regel wie gemergte Plaene: KEIN Delete ohne verifizierten
Record. Baut auf dem P1-Receipt auf (`cmd_archive_plan` in
`scripts/ticket.sh` bleibt die einzige Record-Quelle).

## Concrete Steps

1. `cmd_archive_plan` um `--reason <merged|staged-stale|superseded>`
   erweitern (Default `merged`); Reason in `tickets.ticket_plans`
   mitschreiben (eigene Spalte oder Suffix im Slug, je nach Schema).
2. Stale-Schwelle als Konstante `STAGED_STALE_DAYS=14` am Dateikopf von
   `scripts/ticket.sh` definieren (Vorschlag; finaler Wert in Phase A).
3. Superseded-Fall: Nachfolger-Merge archiviert den ersetzten Plan mit
   `--reason superseded` und Referenz auf den Nachfolger-Slug/PR.
4. Fail-closed beibehalten: Delete-Freigabe nur wenn der Verify-Count
   aus `cmd_archive_plan` >= 1 ist (bestehende Pruefung wiederverwenden,
   kein zweiter Code-Pfad).
5. NUR `scripts/ticket.sh` anfassen; keine andere Datei aendern.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/spec-pipeline-lifecycle/tasks.md` PASS
- Ticket-bezogene Tests laufen gruen, falls vorhanden
  (`task test:changed` bzw. `tests/spec/plan-lifecycle.bats` nach P3)

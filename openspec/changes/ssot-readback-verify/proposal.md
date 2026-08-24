# Proposal: ssot-readback-verify

## Why

Konsequenz 2 aus T015168 (Ghost-shared-db-Episode): Während der Episode antwortete eine
Ghost-Instanz hinter demselben `--context fleet` mit leerer Ticket-Tabelle; Writes liefen in sie
(harmlos, aber unbemerkt möglich). Der Identity-Guard aus T015168 verifiziert den Pod **vor** dem
Write — aber ein Write selbst meldet Erfolg, ohne dass sein Effekt je zurückgelesen wird. Fällt
die Verifikation zwischen Guard und UPDATE auseinander (Pod-Wechsel, Restore-Situation), sind
vertrauenswürdigs-lose Writes weiterhin unsichtbar.

## What

Neuer Helper `_verify_write_effect` in `scripts/vda/ticket/_ticket-core.sh` (neben `_pgpod` :87 /
`_exec_sql` :119), aufgerufen nach den kritischen Write-Verben in `scripts/ticket.sh`
(`cmd_update_status` :151, `cmd_enqueue` :368, `cmd_stage_plan` :373, `cmd_archive_plan` :203):

1. Nach dem UPDATE re-read der Zeile via zweitem `_exec_sql`-Roundtrip gegen denselben
   verifizierten Pod (`SELECT` der intendierten Felder by uuid).
2. Feldweiser Vergleich Erwartung ↔ Ist. Bei Abweichung: lauter Abbruch (exit 1) mit
   Ticket-ID, erwarteten/ist-Werten und Remediation-Hinweis (`TICKET_CTX`, Identity-Guard).
3. Unter `TICKET_OFFLINE=1` Skip mit Offline-Notice (Spiegel zum Write-Skip, `_ticket_offline_skip`).

Keine Änderung an Schema, ticket-mcp oder Factory-Pfaden — rein CLI-intern.

## Root Cause (Symptom/Ursache getrennt)

- **Beobachtet (Fakt):** Ghost-Instanz antwortete auf fleet-Exec-Pfad; Writes dorthin wurden
  nicht bemerkt, weil kein Effekt-Check existiert.
- **Ursache:** Write-Verben behandeln psql-rc=0 als Beleg für Wirkung; ein Erfolg des
  Transportwegs sagt nichts über die gelandete Zeile.

_Ticket: T015668_

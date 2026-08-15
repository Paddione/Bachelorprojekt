# Proposal: status-machine-ssot

## Why
Die 11 gültigen Ticket-Status-Werte (`triage`, `planning`, `plan_staged`, `backlog`, `in_progress`, `in_review`, `qa_review`, `blocked`, `awaiting_deploy`, `done`, `archived`) sind aktuell mehrfach dupliziert:
1. Im PostgreSQL CHECK-Constraint bzw. Schemamigrationen (`migrations.ts`, `tables/tickets.ts`)
2. In TypeScript-Modulen (`admin.ts`, `transition.ts`, `cockpit-db.ts`, `ticket-status.ts`)
3. In Skripten/Validierungen (`triage.sh`)

Dies führt zu Redundanz und Wartungsaufwand bei Änderungen oder Prüfungen.

## What
Konsolidierung der Status-Werte in eine zentrale Single Source of Truth:
1. Zentrales TypeScript-Modul `components/website/src/lib/tickets/status.ts` als SSOT für `TICKET_STATUSES`, `TicketStatus`, `VALID_STATUSES` und `isValidStatus`.
2. Anpassung aller Website-Konsumenten (`admin.ts`, `transition.ts`, `cockpit-db.ts`, `ticket-status.ts`), um aus dem zentralen Modul zu importieren.
3. Bereitstellung von `applyStatusVocabularyMigration` bzw. Einbindung der SSOT in die Schema-Migrationslogik.
4. Absicherung durch BATS- und Vitest-Tests.

_Ticket: T007955_

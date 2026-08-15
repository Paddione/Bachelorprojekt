## ADDED Requirements
<!-- section: status-ssot -->

### Requirement: Ticket-Status-Werte sind in einem zentralen SSOT-Modul definiert
<!-- bats: tickets-status-vocabulary.bats -->

The system SHALL define the 11 valid ticket statuses in a central TypeScript module `components/website/src/lib/tickets/status.ts` exporting `TICKET_STATUSES`, `TicketStatus`, `VALID_STATUSES`, and `isValidStatus()`. Consumers across the website (`admin.ts`, `transition.ts`, `cockpit-db.ts`, and cockpit API routes) SHALL import their status definitions and validation logic from this module instead of defining duplicate constants or union types.

#### Scenario: status.ts exportiert alle 11 Status-Werte und Type-Guards *(Vitest/BATS)*
- **GIVEN** `components/website/src/lib/tickets/status.ts` existiert
- **WHEN** die exportierten Status-Konstanten geprüft werden
- **THEN** enthält `TICKET_STATUSES` exakt die 11 Werte `triage`, `planning`, `plan_staged`, `backlog`, `in_progress`, `in_review`, `qa_review`, `blocked`, `awaiting_deploy`, `done`, `archived`
- **AND** `isValidStatus()` gibt `true` für alle 11 Werte und `false` für ungültige Werte zurück

#### Scenario: Konsumenten importieren Status-Typen aus status.ts *(BATS)*
- **GIVEN** `admin.ts`, `transition.ts` und `cockpit-db.ts` benötigen Status-Definitionen
- **WHEN** die Import-Pfade geprüft werden
- **THEN** importieren sie `TicketStatus` bzw. `VALID_STATUSES` aus `status.ts` (bzw. re-exportieren zur Abwärtskompatibilität)


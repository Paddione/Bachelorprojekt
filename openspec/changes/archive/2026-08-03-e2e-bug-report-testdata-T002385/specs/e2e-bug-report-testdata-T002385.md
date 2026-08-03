## ADDED Requirements

### Requirement: E2E-Bug-Report-Testdaten sind als solche erkennbar

The system SHALL ensure that E2E test data created by the FA-26 bug-report test is
recognizable as test data, either by setting a distinct test indicator (e.g. a `[E2E]` title
prefix) or by cleaning up the created ticket after the test run, so that real ticket rows are
not polluted with indistinguishable test payloads.

#### Scenario: Test-Ticket trägt einen [E2E]-Indikator

- **GIVEN** der FA-26 E2E-Test legt einen Bug-Report an
- **WHEN** der Test gegen die Live-Brand-API läuft
- **THEN** trägt der erzeugte Ticket-Titel einen erkennbaren `[E2E]`-Präfix
- **AND** die Test-Zeile ist damit von echten Tickets unterscheidbar

#### Scenario: Test-Daten werden nach dem Lauf aufgeräumt

- **GIVEN** der FA-26 E2E-Test hat ein Test-Ticket angelegt
- **WHEN** der Testlauf abgeschlossen ist
- **THEN** wird das Test-Ticket via `DELETE /api/admin/tickets/:id` entfernt
- **AND** es bleibt keine Test-Zeile in `tickets.tickets` zurück

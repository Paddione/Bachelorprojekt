# Delta: factory-watchdog

## ADDED Requirements

### Requirement: Ticket-Status-Reaper für verwaiste in_progress
Der Watchdog MUSS `in_progress`-Tickets ohne Agent-Lock und ohne Remote-Branch nach einer
Karenzzeit auf `triage` zurücksetzen.

#### Scenario: Verwaistes in_progress-Ticket wird zurückgesetzt

- **GIVEN** ein Ticket mit Status `in_progress`, seit >24h ohne Agent-Lock und ohne Remote-Branch
- **WHEN** der Watchdog läuft
- **THEN** das Ticket wird auf `triage` zurückgesetzt
- **AND** ein Kommentar dokumentiert die Zurücksetzung

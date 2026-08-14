## ADDED Requirements

### Requirement: Nicht ermittelbarer Ticket-Status bricht den Sweep nicht ab

The system SHALL den branch-reaper-Sweep fortsetzen, wenn der Ticket-Status zu einer
aus dem Branch-Namen extrahierten Ticket-ID nicht ermittelbar ist (z. B. weil die ID im
Tracker nicht existiert), und den betroffenen Branch mit einer KEEP-Begründung verschonen.

#### Scenario: Nicht-existentes Ticket im Sweep

- **GIVEN** ein Remote-Branch, dessen Name eine Ticket-ID trägt, die im Tracker nicht existiert, und `scripts/branch-reaper.sh --sweep --dry-run` läuft
- **WHEN** die Status-Ermittlung für diesen Branch fehlschlägt (ticket.sh Exit ≠ 0, kein JSON-`"status"`-Feld)
- **THEN** bricht der Sweep nicht ab, gibt eine KEEP-Zeile für den Branch aus und endet mit Exit 0

#### Scenario: Ermittelbarer Status bleibt unverändert

- **GIVEN** ein Remote-Branch, dessen Ticket-Status ermittelbar ist
- **WHEN** der Sweep ihn prüft
- **THEN** gilt das bestehende Verhalten unverändert: Status `done`/`archived` führt zu REAP, jeder andere Status zu KEEP

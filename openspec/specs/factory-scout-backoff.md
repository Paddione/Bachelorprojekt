# factory-scout-backoff

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu factory-scout-backoff ergänzen._

## Requirements

### Requirement: Scout-weak-Tickets werden nach wiederholten Fehlern eskaliert

The system SHALL escalate a ticket to `attention_mode='needs_human'` after N consecutive
`scout_weak` failures instead of retrying it identically forever, and SHALL add a comment
explaining the escalation.

#### Scenario: Drei aufeinanderfolgende scout_weak-Ergebnisse eskalieren das Ticket

- **GIVEN** ein Ticket liefert wiederholt `scout_weak`-Ergebnisse
- **WHEN** der Retry-Zähler den Schwellwert von 3 erreicht
- **THEN** wird `attention_mode='needs_human'` auf dem Ticket gesetzt
- **AND** ein Kommentar erklärt die Eskalation

#### Scenario: Unterhalb des Schwellwerts bleibt das Verhalten unverändert

- **GIVEN** ein Ticket hat weniger als 3 `scout_weak`-Ergebnisse
- **WHEN** der Scout-Gate läuft
- **THEN** wird der Retry-Versuch protokolliert
- **AND** das Ticket bleibt im bisherigen `scout_weak`-Status

### Requirement: Dispatcher wendet Backoff auf scout_weak-Tickets an

The system SHALL have the factory dispatcher skip a ticket for the current tick when the
pipeline returns `status: 'scout_weak'`, instead of letting it be re-queued immediately, and
SHALL note the backoff on the ticket.

#### Scenario: scout_weak-Ticket wird im aktuellen Tick übersprungen

- **GIVEN** die Pipeline liefert `status: 'scout_weak'` für ein Ticket
- **WHEN** der Dispatcher den Tick verarbeitet
- **THEN** wird das Ticket für den aktuellen Tick übersprungen
- **AND** ein Kommentar vermerkt den Backoff
- **AND** das Ticket bleibt im Triage-Status, sodass es erst im nächsten Tick wieder aufgenommen wird

<!-- merged from change delta factory-scout-backoff.md (f37c388c92e9) -->
## ADDED Requirements

### Requirement: Title and Description Patch

The system SHALL provide a write path (`scripts/ticket.sh update-fields` and the
`mcp__ticket-mcp__update_fields` tool) that patches a ticket's `title` and/or `description`
columns directly, so a title or description formulated on an unverified hypothesis stays
correctable once root-cause verification (T002448-M5) changes the picture. The write path SHALL
require at least one of `--title`/`--description` (or `title`/`description`/`notes` for the MCP
tool), SHALL respect the existing ticket agent-lock guard, and SHALL support `TICKET_OFFLINE=1`
for offline skip.

#### Scenario: CLI patches the title

- **GIVEN** ein Ticket mit `external_id = 'T000001'`
- **WHEN** `scripts/ticket.sh update-fields --id T000001 --title "Neuer Titel"` läuft
- **THEN** endet der Aufruf mit Exit-Code 0, und `title` des Tickets ist `"Neuer Titel"`

#### Scenario: CLI rejects a call with no fields

- **GIVEN** kein `--title`, `--description` oder `--notes` wird übergeben
- **WHEN** `scripts/ticket.sh update-fields --id T000001` läuft
- **THEN** endet der Aufruf mit Exit-Code 2 und einer Fehlermeldung auf stderr

#### Scenario: CLI honours TICKET_OFFLINE

- **GIVEN** `TICKET_OFFLINE=1` ist gesetzt
- **WHEN** `scripts/ticket.sh update-fields --id T000001 --title "x"` läuft
- **THEN** endet der Aufruf mit Exit-Code 0, ohne die Datenbank zu erreichen, und die Ausgabe
  enthält `OFFLINE`

#### Scenario: MCP tool schema accepts title and description

- **GIVEN** der `mcp__ticket-mcp__update_fields`-Tool-Aufruf
- **WHEN** das JSON-Schema des Tools inspiziert wird
- **THEN** enthält es `title`, `description` und `notes` als patchbare String-Properties, passend
  zur Tool-Beschreibung „Bulk-Patch: ändert title, description oder notes eines Tickets."

## ADDED Requirements

### Requirement: plan-meta trims comma-separated areas and depends_on values

The system SHALL trim leading and trailing whitespace of every comma-separated item
when `ticket.sh plan-meta set` stores the `areas` or `depends_on` arrays. A value like
`tickets, db` SHALL be stored as `{tickets, db}`, never as `{'tickets',' db'}`.

#### Scenario: plan-meta stores trimmed areas items

- **GIVEN** a ticket exists
- **WHEN** `ticket.sh plan-meta set --id <id> --areas "tickets, db"` is executed
- **THEN** the stored `areas` array is exactly `{tickets,db}`
- **AND** no array item has leading or trailing whitespace

#### Scenario: plan-meta stores trimmed depends_on items

- **GIVEN** a ticket exists
- **WHEN** `ticket.sh plan-meta set --id <id> --depends-on "T000100, T000200"` is executed
- **THEN** the stored `depends_on` array is exactly `{T000100,T000200}`

### Requirement: create trims comma-separated areas values

The system SHALL trim leading and trailing whitespace of every comma-separated item
when `ticket.sh create --areas` stores the `areas` array.

#### Scenario: create stores trimmed areas items

- **GIVEN** no ticket exists
- **WHEN** `ticket.sh create --type fix --areas "tickets, db"` is executed
- **THEN** the stored `areas` array is exactly `{tickets,db}`
- **AND** no array item has leading or trailing whitespace

### Requirement: no areas migration of historical rows

The trim fix SHALL NOT rewrite historical `areas` rows. Existing rows with leading
whitespace remain untouched; the fix prevents new occurrences (process fix).

#### Scenario: historical rows stay untouched

- **GIVEN** a ticket with an areas item `" db"` exists
- **WHEN** the fix is deployed
- **THEN** the historical row is unchanged

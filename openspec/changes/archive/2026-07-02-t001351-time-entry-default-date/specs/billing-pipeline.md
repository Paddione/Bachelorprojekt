## ADDED Requirements

### Requirement: Time Entry Date Falls Back to CURRENT_DATE When Omitted

The system SHALL persist a `time_entries` row with `entry_date` set to
`CURRENT_DATE` when `createTimeEntry()` is called without an explicit
`entryDate`, and SHALL persist the given date when one is provided. The
column DEFAULT alone is NOT sufficient, because the INSERT statement always
supplies an explicit parameter value for `entry_date`; a NULL parameter value
bypasses the column DEFAULT and violates the NOT NULL constraint instead.

#### Scenario: Zeiteintrag ohne entryDate erhält CURRENT_DATE

- **GIVEN** ein Aufruf von `createTimeEntry({ projectId, minutes })` ohne
  `entryDate`
- **WHEN** der INSERT gegen `time_entries` ausgeführt wird
- **THEN** enthält die INSERT-Query `COALESCE($8::date, CURRENT_DATE)` für
  den `entry_date`-Parameterslot
- **AND** der Insert schlägt NICHT mit einer NOT-NULL-Constraint-Verletzung
  fehl

#### Scenario: Zeiteintrag mit explizitem entryDate übernimmt das Datum unverändert

- **GIVEN** ein Aufruf von `createTimeEntry({ projectId, minutes, entryDate: '2026-05-01' })`
- **WHEN** der INSERT gegen `time_entries` ausgeführt wird
- **THEN** wird `entry_date` auf `2026-05-01` gesetzt (COALESCE reicht einen
  Nicht-NULL-Wert unverändert durch)

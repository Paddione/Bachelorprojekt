## ADDED Requirements

### Requirement: external_id-Sequenz-Reseed ist monoton (nie rückwärts)

The system SHALL reseed `tickets.external_id_seq` (in `applyLegacyMigrations()`, run on
every schema-init) using `GREATEST()` over the table's observed `MAX(external_id)` and the
sequence's own current `last_value`, and SHALL NOT overwrite the sequence with a value lower
than its current `last_value`, preventing a concurrent schema-init reseed from re-issuing an
`external_id` already dispensed (committed or not) by a concurrent `nextval()` call.

#### Scenario: Reseed reduziert die Sequenz nicht unter ihren aktuellen Stand *(BATS)*

- **GIVEN** `website/src/lib/tickets/migrations.ts` enthält den periodischen
  `setval('tickets.external_id_seq', ...)`-Reseed in `applyLegacyMigrations()`
- **WHEN** die Reseed-Anweisung auf ihr SQL-Muster geprüft wird
- **THEN** enthält sie `GREATEST(` und referenziert sowohl `MAX(CAST(SUBSTRING(external_id FROM 2) AS BIGINT))` aus der Tabelle als auch `last_value FROM tickets.external_id_seq` (den aktuellen Sequenzstand), sodass der Reseed niemals einen niedrigeren Wert setzt als den, den die Sequenz bereits erreicht hat

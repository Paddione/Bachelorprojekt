## ADDED Requirements

### Requirement: Ticket-Typ nutzt das Conventional-Commit-Vokabular

The system SHALL constrain `tickets.tickets.type` to the Conventional-Commit vocabulary
`fix`, `feat`, `chore`, `project`, `docs`, `refactor`, `perf`, `test`, `ci` and `build`,
enforced by a **named** constraint `tickets_type_check`. During the transition the constraint
SHALL additionally accept the legacy values `bug`, `feature` and `task`, so that a database
migrated ahead of its callers — or callers deployed ahead of their database — never rejects a
write. The legacy values are removed in a later change.

The constraint SHALL NOT be declared inline on `ADD COLUMN IF NOT EXISTS`, because that form is
a no-op against an existing column and would leave the live constraint unchanged.

#### Scenario: Named constraint replaces the inline declaration

- **GIVEN** `tickets.tickets` already exists with the legacy inline CHECK
- **WHEN** `applyLegacyMigrations()` runs
- **THEN** the source drops any constraint named `tickets_type_check` and adds it back by name,
  and no `CHECK (type IN …)` clause remains attached to the `ADD COLUMN IF NOT EXISTS type` statement

#### Scenario: New vocabulary is accepted

- **GIVEN** the migration has run
- **WHEN** a ticket is inserted with `type='fix'`, `type='chore'` or `type='refactor'`
- **THEN** the insert succeeds

#### Scenario: Legacy vocabulary is still accepted during the transition

- **GIVEN** the migration has run
- **WHEN** a ticket is inserted with `type='bug'`
- **THEN** the insert succeeds, so a caller that has not yet been updated cannot fail

#### Scenario: Unknown values remain rejected

- **GIVEN** the migration has run
- **WHEN** a ticket is inserted with `type='wontfix'`
- **THEN** the insert is rejected by `tickets_type_check`

### Requirement: Bestandsdaten werden idempotent auf das neue Vokabular migriert

The system SHALL rewrite existing rows from the legacy vocabulary to the new one — `bug` to
`fix`, `feature` to `feat`, `task` to `chore` — as part of `applyLegacyMigrations()`, so the
migration reaches **both** brand databases through the ordinary pod-boot path rather than a
one-shot script. `project` SHALL remain unchanged. Re-running the migration SHALL affect zero
rows.

#### Scenario: Legacy rows are rewritten

- **GIVEN** rows with `type` in (`bug`, `feature`, `task`)
- **WHEN** `applyLegacyMigrations()` runs
- **THEN** they hold `fix`, `feat` and `chore` respectively, and rows with `type='project'` are untouched

#### Scenario: Second run is a no-op

- **GIVEN** the migration has already run once
- **WHEN** it runs again
- **THEN** it updates zero rows and raises no error

### Requirement: Views lesen beide Vokabulare

The system SHALL define `tickets.v_active_features` and `tickets.v_factory_metrics` so they
match `type IN ('feature','feat')` rather than `type = 'feature'`. Because both views accept
either vocabulary, they return identical row counts before and after the data migration, and
the migration therefore does not need to be atomic with respect to them.

#### Scenario: Row count is stable across the migration

- **GIVEN** a set of feature tickets eligible for `v_active_features`
- **WHEN** the data migration rewrites `feature` to `feat`
- **THEN** `v_active_features` returns the same rows before and after

#### Scenario: Metrics view counts both vocabularies

- **GIVEN** rows with `type='feature'` and rows with `type='feat'` in the same 30-day window
- **WHEN** `v_factory_metrics` is queried
- **THEN** `total_features` counts both

## MODIFIED Requirements

### Requirement: Inert pg_notify Trigger feuert ausschließlich bei Feature-Inserts

The system SHALL define a PostgreSQL trigger function `tickets.notify_feature_inserted` that fires
AFTER INSERT on `tickets.tickets` only when `NEW.type IN ('feature','feat')`, broadcasts on the
channel `factory_feature_inserted`, and SHALL be explicitly documented as NOT-CONSUMED so no
phantom consumer is accidentally wired. The trigger condition SHALL accept both the legacy and
the new vocabulary, so the type migration does not silence it.

#### Scenario: Trigger-Funktion und Kanal sind im Schema vorhanden

- **GIVEN** `initTicketsSchema()` wurde ausgeführt
- **WHEN** der Quellcode von `tickets-db.ts` auf Trigger-Definition geprüft wird
- **THEN** enthält er sowohl `CREATE OR REPLACE FUNCTION tickets.notify_feature_inserted` als auch den Kanalnamen `factory_feature_inserted`

#### Scenario: Trigger ist als nicht-konsumiert dokumentiert

- **GIVEN** das Trigger-DDL in `tickets-db.ts`
- **WHEN** der Code auf das Load-Bearing-Kommentar geprüft wird
- **THEN** enthält die Datei einen Kommentar, der `NOT-CONSUMED` oder `not consumed in Phase 3` beschreibt, damit kein Phantom-Consumer verdrahtet wird

#### Scenario: Trigger überlebt die Vokabular-Migration

- **GIVEN** die Typ-Migration hat `feature` zu `feat` umgeschrieben
- **WHEN** ein Ticket mit `type='feat'` eingefügt wird
- **THEN** feuert der Trigger und sendet auf `factory_feature_inserted`

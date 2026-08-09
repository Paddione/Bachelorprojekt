## ADDED Requirements

### Requirement: Automated Migration Runner

The system SHALL automatically apply pending SQL migration files from `migrations/` in lexicographical order during deployment or container startup and track applied migrations in a database ledger table.

#### Scenario: Lexicographical execution and tracking of migrations
- **GIVEN** a database with missing migrations from `migrations/*.sql`
- **WHEN** the migration runner (`scripts/migrate-factory.mjs` or `task factory:migrate`) is executed
- **THEN** missing migration files are executed in alphabetical order within transactions and recorded in `public.factory_schema_migrations` with `filename` and `applied_at`.

#### Scenario: Idempotent re-run of migration runner
- **GIVEN** a database where all migrations in `migrations/*.sql` have already been applied and recorded in `public.factory_schema_migrations`
- **WHEN** the migration runner is executed again
- **THEN** zero migrations are executed, no errors are raised, and the process completes cleanly.

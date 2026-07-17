## ADDED Requirements

### Requirement: G-DB01 FK-Column Index Coverage (Target)

The measurement command SHALL count foreign-key columns (single-column FKs) that lack a matching
index, using the read-only `db_scalar` helper with a `NOT EXISTS`-pattern query over
`pg_constraint`/`pg_index`. This is a Target — a non-zero count does NOT fail the health check
(unless `--strict` is set).

#### Scenario: FK columns missing an index are counted

- **GIVEN** a database with at least one FK column that has no covering index
- **WHEN** the G-DB01 measure runs against the live `shared-db`
- **THEN** the command returns the count of FK-columns without an index (baseline: 4)

### Requirement: G-DB03 brand-Column CHECK-Constraint Coverage (Target)

The measurement command SHALL compute the gap between tables having a `brand` column and those
having a CHECK constraint restricting `brand` to `'mentolder'`, using read-only
`information_schema.columns` and `pg_constraint`. This is a Target — a non-zero gap does NOT fail
the health check (unless `--strict`).

#### Scenario: brand columns without CHECK constraint are counted

- **GIVEN** a database with `brand` columns that lack a CHECK constraint
- **WHEN** the G-DB03 measure runs against the live `shared-db`
- **THEN** the command returns the number of tables missing a brand CHECK constraint (baseline: 44)

### Requirement: G-DB04 Backup Age Gate

The measurement command SHALL determine the age (in hours) of the most recent successful
`db-backup` Job by querying `kubectl get jobs` for completion timestamps with
`succeeded==1`. This is a Gate — a value exceeding 26 hours SHALL fail
`scripts/health-goals-check.sh`.

#### Scenario: Backup age exceeds 26-hour window

- **GIVEN** a cluster with a `db-backup` CronJob that has not succeeded recently
- **WHEN** the G-DB04 measure runs via `db_backup_age_h`
- **THEN** the command returns the elapsed hours since the last successful backup, and a value
  >26 causes a Gate violation (currently ~163 h, tracked as T001738)

### Requirement: G-DB06 Orphan-Row Integrity Gate

The measurement command SHALL count orphan rows across the FK pairs
`tickets.ticket_plans.ticket_id`, `tickets.ticket_comments.ticket_id`, and
`tickets.ticket_links.from_id` (each referencing `tickets.tickets.id`) using read-only
`NOT EXISTS` sub-queries. This is a Gate — a non-zero total SHALL fail
`scripts/health-goals-check.sh`.

#### Scenario: No orphan rows across the tracked FK pairs

- **GIVEN** the three FK pairs in the `tickets` schema
- **WHEN** the G-DB06 measure command runs against the live `shared-db`
- **THEN** the summed orphan count is 0 and the gate passes

### Requirement: G-DB08 Sequential-Scan Ratio on Large Tables (Target)

The measurement command SHALL count user tables with >10k live rows whose sequential-scan ratio
exceeds 5 %, using `pg_stat_user_tables` (read-only). This is a Target — a value exceeding the
threshold does NOT fail the health check (unless `--strict`).

#### Scenario: Tables with high seq-scan ratio on large data sets

- **GIVEN** a database with tables exceeding 10k rows
- **WHEN** the G-DB08 measure runs via `db_scalar` against `pg_stat_user_tables`
- **THEN** the command returns the count of tables with seq-scan share >5 % (baseline: 1,
  `chunks` at 9.5 %)

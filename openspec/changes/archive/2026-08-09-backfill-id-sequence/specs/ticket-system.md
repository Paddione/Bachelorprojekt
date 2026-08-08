## ADDED Requirements

### Requirement: Backfill draws external_id from the canonical sequence

The `backfill-id` command SHALL obtain new `external_id` values from
`tickets.external_id_seq` — the same sequence the `tickets.fn_assign_external_id()`
BEFORE-INSERT trigger uses. It SHALL NOT reference any other sequence.

A second counter would hand out T-numbers the trigger later hands out again, reproducing
the brand-wide collision recorded in T002731.

#### Scenario: Backfilling a row with a NULL external_id

- **GIVEN** a row in `tickets.tickets` whose `external_id` is NULL
- **WHEN** `bash scripts/ticket.sh backfill-id --brand mentolder` runs
- **THEN** the command exits 0
- **AND** the row receives an `external_id` matching `^T[0-9]{6}$`
- **AND** the assigned number equals the value drawn from `tickets.external_id_seq`

#### Scenario: Referencing a sequence that the schema never creates

- **GIVEN** the command references a sequence name absent from the schema migration
- **WHEN** the command runs against any live ticket database
- **THEN** PostgreSQL aborts with `relation "…" does not exist` and a non-zero exit code
- **AND** no row is modified

### Requirement: An empty backfill run reports itself as empty

The `backfill-id` command SHALL report how many rows it updated, including when that
number is zero, and SHALL exit 0 in that case.

Because the BEFORE-INSERT trigger assigns an `external_id` to every regularly inserted
row, the eligible set is normally empty. Without an explicit count, an idle run is
indistinguishable from a successful one — the same silent-success failure mode that let
the T002731 collision go unnoticed.

#### Scenario: No rows are eligible for backfilling

- **GIVEN** no row in `tickets.tickets` has a NULL `external_id`
- **WHEN** `bash scripts/ticket.sh backfill-id --brand mentolder` runs
- **THEN** the command exits 0
- **AND** its output states that zero rows were backfilled

#### Scenario: Rows are eligible for backfilling

- **GIVEN** at least one row has a NULL `external_id`
- **WHEN** the command runs
- **THEN** its output states the number of rows it updated
- **AND** that number matches the count of rows it actually changed

### Requirement: Sequence names in ticket scripts match the schema migration

Every sequence referenced via `nextval('tickets.…')` in `scripts/vda/ticket/*.sh` SHALL
be created by `website/src/lib/tickets/migrations.ts`.

This binds the two artefacts that drifted apart in T002732 and is verifiable offline,
so CI catches the next such drift without a live database.

#### Scenario: A script references an unknown sequence

- **GIVEN** a script under `scripts/vda/ticket/` calls `nextval('tickets.some_seq')`
- **AND** `migrations.ts` contains no `CREATE SEQUENCE` for `tickets.some_seq`
- **WHEN** the offline consistency check runs
- **THEN** it fails and names the offending sequence and file

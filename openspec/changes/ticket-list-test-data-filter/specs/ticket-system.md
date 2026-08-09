## ADDED Requirements

### Requirement: Ticket listings hide test data by default

`scripts/ticket.sh list` SHALL exclude rows marked `is_test_data = true` from its result by
default. It SHALL accept `--include-test-data` as an explicit opt-out that restores the
unfiltered result. The filter SHALL apply to every other filter combination
(`--status`, `--type`, `--attention-mode`, `--missing-id`) rather than only to the
unfiltered call. Because `mcp__ticket-mcp__list_tickets` wraps this command, the same
behaviour SHALL apply there, and the wrapper SHALL be able to pass the opt-out through.

Single-ticket commands addressed by `external_id` — notably `get` and `triage` — SHALL NOT
filter on `is_test_data`: a deliberately addressed test ticket must remain reachable.

#### Scenario: A seeded test ticket is absent from the default listing

- **GIVEN** a ticket exists with `is_test_data = true` and status `backlog`
- **WHEN** `scripts/ticket.sh list --status backlog` runs
- **THEN** the command SHALL exit 0 and return a JSON array
- **AND** the array SHALL NOT contain that ticket

#### Scenario: The opt-out restores the test ticket

- **GIVEN** the same seeded ticket
- **WHEN** `scripts/ticket.sh list --status backlog --include-test-data` runs
- **THEN** the command SHALL exit 0
- **AND** the array SHALL contain that ticket

#### Scenario: A ticket addressed by id stays reachable

- **GIVEN** the same seeded ticket
- **WHEN** `scripts/ticket.sh get --id <external_id>` runs
- **THEN** the ticket SHALL be returned

### Requirement: The fixture teardown actually reaps its test data

`purge_factory_test_data` in `tests/lib/factory-test-fixtures.sh` SHALL resolve the database
pod in the namespace that actually holds it for the given context, so that a `teardown`
calling it removes the rows it seeded. It SHALL NOT silently succeed when no pod was found.

#### Scenario: Seeded fixture is gone after teardown

- **GIVEN** a test seeded a ticket through `seed_test_feature`
- **WHEN** the test file's teardown calls `purge_factory_test_data` for that brand
- **THEN** no row with `is_test_data = true` SHALL remain for that brand

#### Scenario: An unreachable database is reported, not swallowed

- **GIVEN** no database pod can be resolved for the given context
- **WHEN** `purge_factory_test_data` runs
- **THEN** it SHALL return a non-zero status
- **AND** it SHALL name the namespace and context it searched

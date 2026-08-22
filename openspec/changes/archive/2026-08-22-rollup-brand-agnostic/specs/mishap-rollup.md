## ADDED Requirements

### Requirement: Rollup container resolution is brand-agnostic

The rollup container resolution (`scripts/ticket.sh rollup-container`) SHALL resolve and create
the rollup container without any brand predicate. The `--brand` option SHALL either be removed
or accepted-and-ignored with a deprecation note, and container creation SHALL pin a documented
constant brand (`ROLLUP_CONTAINER_BRAND`). The function header SHALL state that the rollup lane
is deliberately cross-brand.

#### Scenario: Generator adopts the open container regardless of invoking brand

- **GIVEN** an open rollup container exists with `brand='korczewski'`
- **WHEN** the generator runs without any brand context
- **THEN** resolution returns that container's `external_id`
- **AND** no new container is created

#### Scenario: Container creation uses the pinned constant brand

- **GIVEN** no open rollup container exists in collect mode
- **WHEN** `scripts/ticket.sh rollup-container` creates a new one
- **THEN** the created ticket carries the brand from `ROLLUP_CONTAINER_BRAND`, independent of
  any ambient `BRAND` environment value

### Requirement: Mishap-rollup generator runs once per tick

The factory tick (`scripts/factory/wakeup.sh`) SHALL invoke `scripts/factory/mishap-rollup.sh`
exactly once per tick, not once per brand. The mishap buffer flush step immediately before it
SHALL remain per-brand.

#### Scenario: Single generator invocation per tick

- **GIVEN** a factory tick reaches the mishap-rollup driver section
- **WHEN** wakeup.sh executes the rollup generation steps
- **THEN** `mishap-rollup.sh` runs exactly once
- **AND** the preceding `--flush-stale-mishaps` invocations still run once per brand

### Requirement: Rollup tickets carry consistent brand across read paths

For a given ticket row, all ticket read interfaces (`get_ticket` and the timeline export) SHALL
report the same `brand` value as stored in the database.

#### Scenario: Timeline export matches get_ticket on brand

- **GIVEN** ticket T013107 with `brand='korczewski'` in `tickets.tickets`
- **WHEN** both `get_ticket` and the timeline export are queried without explicit brand
- **THEN** both report `korczewski`

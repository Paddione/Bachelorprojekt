## ADDED Requirements

### Requirement: Container resolution SHALL be verifiable against the live database

The container-resolution behavior of `scripts/ticket.sh rollup-container` SHALL be
covered by a regression test that runs against the real ticket database (not kubectl
mocks), so that the predicate emitted by the search (`status NOT IN ('done','archived')`)
and the single-open-container invariant are pinned on the actual execution path. The test
SHALL skip cleanly when no cluster is reachable or the production invariant ("exactly one
open container") is violated.

#### Scenario: Real-DB test verifies the resolution predicate and the no-duplicate invariant

- **GIVEN** a reachable cluster with a ticket database holding exactly one open rollup container
- **WHEN** `tests/spec/mishap-rollup/container-resolution-real-db.bats` runs
- **THEN** `rollup-container` SHALL return that container's `external_id` without creating a duplicate
- **AND** the SQL emitted by the search SHALL contain `status NOT IN ('done','archived')` and SHALL NOT contain a positive `status IN (` allowlist

#### Scenario: Real-DB test skips when the cluster is unreachable

- **GIVEN** no reachable cluster (e.g. CI without a live database)
- **WHEN** the real-DB test runs
- **THEN** it SHALL skip (not fail) with an explicit skip reason

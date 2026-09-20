## ADDED Requirements

### Requirement: The k3d migration verifies row counts against the archived dump
<!-- bats: local-dev-mesh/migrate-from-k3d.bats -->

`scripts/devmesh/migrate-from-k3d.sh` SHALL take its source row counts from the archived
`pg_dumpall` dump of the former local k3d cluster, not from a kubeconfig context. The dump path
SHALL be overridable through `DEVMESH_SRC_DUMP`. The script SHALL count the rows of every `COPY`
block per database in that dump and compare them table by table against the devmesh
`shared-db`. The script SHALL NOT write to the dump and SHALL NOT offer a restore subcommand,
because a cluster dump can only be replayed with `DROP DATABASE` on the target.

#### Scenario: Counts are taken from the dump

- **GIVEN** a `pg_dumpall` dump containing `COPY` blocks for two databases
- **WHEN** the `counts` subcommand runs
- **THEN** one count file per database is written
- **AND** each line names a table and its row count from the dump

#### Scenario: Matching row counts pass

- **GIVEN** the devmesh database reports the same row count for every table in the dump
- **WHEN** the `verify` subcommand runs
- **THEN** it exits `0` and names each matching table

#### Scenario: A differing table is named and fails

- **GIVEN** one table in devmesh reports a different row count than the dump
- **WHEN** the `verify` subcommand runs
- **THEN** it exits non-zero and names that table with both counts

#### Scenario: A missing dump is a precondition, not a finding

- **GIVEN** `DEVMESH_SRC_DUMP` points at a path that does not exist
- **WHEN** the `preflight` subcommand runs
- **THEN** it exits `2` and names the missing path

#### Scenario: Production is refused as target

- **GIVEN** `DEVMESH_DST_CTX` is set to `fleet`
- **WHEN** any subcommand runs
- **THEN** it exits non-zero before the first `kubectl` call

## MODIFIED Requirements

### Requirement: No active reference to the k3d dev context remains

The repository SHALL contain no reference to the former local k3d dev context outside
`openspec/changes/`, `docs/superpowers/plans/`, `docs/superpowers/specs/archive/`, `docs/adr/`,
`k3d/docs-content-built/`, `scripts/migrations/` and `docs/spec-atlas.md`. The guard
`tests/spec/local-dev-mesh/no-k3d-context.bats` SHALL hold the search pattern itself, so that
this requirement does not need to spell it. Context defaults in the factory and ticket tooling
SHALL resolve to `fleet`.

#### Scenario: Guard finds no active reference

- **GIVEN** the repository after this change
- **WHEN** `tests/spec/local-dev-mesh/no-k3d-context.bats` searches the tracked files outside
  the excluded paths
- **THEN** the search returns no match
- **AND** the same search run against an excluded archive path returns at least one match

#### Scenario: Factory context default

- **GIVEN** `FACTORY_CTX` is unset
- **WHEN** `scripts/factory/lib.sh` is sourced
- **THEN** `FACTORY_CTX` equals `fleet`

#### Scenario: Generated and historical paths stay excluded

- **GIVEN** `docs/spec-atlas.md` is generated from the specs and carries requirement titles
  verbatim, including the titles of removed requirements
- **WHEN** the guard builds its exclusion list
- **THEN** that file is excluded unconditionally, not while some change directory exists

## REMOVED Requirements

### Requirement: The k3d dev cluster is removed only after the acceptance gate

**Reason:** The cluster no longer exists — `k3d cluster list` returns no entry (2026-09-20). A
gate on a teardown that has already happened cannot be satisfied or violated.

### Requirement: k3d-mentolder-dev is decommissioned after devmesh acceptance

**Reason:** Superseded by the completed teardown. What remains of it — the row-count proof and
the ban on live references — is carried by the two requirements above.

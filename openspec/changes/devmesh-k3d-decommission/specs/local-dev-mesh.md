## ADDED Requirements

### Requirement: The k3d dev cluster is removed only after the acceptance gate

`task devmesh:acceptance` SHALL exit `0` only when the devmesh health gate passes, the SP-3
migration comparison has passed, and a fresh dump of the `k3d-mentolder-dev` databases exists
outside the cluster. The k3d teardown task SHALL refuse to run unless the acceptance gate has
passed.

#### Scenario: Teardown without a fresh dump is refused

- **GIVEN** the devmesh health gate passes and no dump of the k3d databases exists
- **WHEN** the teardown task runs
- **THEN** it exits non-zero and the k3d cluster keeps running

#### Scenario: Gate passes and teardown proceeds

- **GIVEN** the health gate passes, the migration comparison passed and a fresh dump exists
- **WHEN** the teardown task runs
- **THEN** the cluster `mentolder-dev` no longer exists on `ws-ubuntu-1`

### Requirement: No active reference to the k3d dev context remains

The repository SHALL contain no reference to `k3d-mentolder-dev` outside
`openspec/changes/archive/`, `docs/superpowers/plans/`, `docs/superpowers/specs/archive/` and
`docs/adr/`. Context defaults in the factory and ticket tooling SHALL resolve to `fleet`.

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

### Requirement: The fourth host joins devmesh as an agent

After the k3d teardown, `ws-ubuntu-1` SHALL join devmesh as a k3s agent with the tailnet tag
`tag:devmesh`, and the default `DEVMESH_PROFILE` SHALL be `full`.

#### Scenario: Four nodes after the join

- **GIVEN** the join completed
- **WHEN** `kubectl --context devmesh get nodes` runs
- **THEN** four nodes are `Ready` and `ws-ubuntu-1` has no control-plane role

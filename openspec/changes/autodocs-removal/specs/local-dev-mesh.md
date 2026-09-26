## MODIFIED Requirements

### Requirement: No active reference to the k3d dev context remains

The repository SHALL contain no reference to the former local k3d dev context outside
`openspec/changes/`, `docs/superpowers/plans/`, `docs/superpowers/specs/archive/`, `docs/adr/`,
`scripts/migrations/`, `docs/spec-atlas.md` and
`scripts/devmesh/migrate-from-k3d.sh` (which names the archived dump file, not a context). The guard
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
- **AND** `scripts/devmesh/migrate-from-k3d.sh` is excluded, because the archived dump file is
  named after the cluster it came from

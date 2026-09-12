## MODIFIED Requirements

### Requirement: backfill-id BATS-Verhaltenstests laufen bei erreichbarem Cluster tatsächlich

Ticket behavior tests SHALL select their target through `FACTORY_CTX`. Without an explicit target they use `devmesh` and skip writes because ticket tooling refuses writes there.

#### Scenario: Default does not write development data

- **GIVEN** `FACTORY_CTX` is unset
- **WHEN** the write-capable test runs
- **THEN** it skips with `devmesh` as the reason

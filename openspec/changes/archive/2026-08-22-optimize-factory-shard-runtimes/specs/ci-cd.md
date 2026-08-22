## ADDED Requirements

### Requirement: Factory Shard Setup Minimization
Each shard of the `test-factory-shard` matrix MUST only execute setup steps strictly required for running the assigned subset of BATS spec tests.

#### Scenario: ticket-mcp tests executed in fast gate job
- **GIVEN** a CI workflow triggered on pull request or push
- **WHEN** the `test-factory-openspec` job runs
- **THEN** it executes `task ticket-mcp:test` alongside OpenSpec validations
- **AND** the 4 `test-factory-shard` jobs do NOT execute `task ticket-mcp:test` redundantly

### Requirement: Spec Runtime Manifest Completeness
The runtime manifest `tests/spec/.spec-runtime.tsv` MUST provide measured runtime weights for at least 95% of all `.bats` files present under `tests/spec/`.

#### Scenario: LPT shard balancing with up-to-date weights
- **GIVEN** the complete list of spec test files in `tests/spec/`
- **WHEN** `scripts/spec-shard.sh --verify --of 4` is executed
- **THEN** the load balance between the lightest and heaviest shard is within 90-100%
- **AND** missing test weights do not cause severe tail latency in any shard

## ADDED Requirements

### Requirement: Versioned eval set is wired into CI

The repository SHALL maintain the versioned retrieval eval set at
`tests/fixtures/brain/retrieval-eval.jsonl`, covering runbook, adr, spec and
diagram queries plus validity-filter (`as_of`/stale) and field-filter cases,
and CI SHALL execute it through the offline runner on a deterministic fixture.

#### Scenario: Wired set passes on fixture

- **GIVEN** the versioned eval set and a fixture wiki directory
- **WHEN** the offline runner evaluates the set twice
- **THEN** both runs report identical Recall@k, MRR and stale-result rate
- **AND** the BATS suite covering this requirement is green in CI

#### Scenario: Invalid set fails closed

- **GIVEN** an eval set with an unknown top-level key or an empty case list
- **WHEN** the runner loads it
- **THEN** it exits non-zero without emitting metrics

### Requirement: Baseline artifact is recorded

The repository SHALL commit a machine-readable baseline of a real-wiki eval
run at `tests/fixtures/brain/retrieval-baseline.json` carrying `schema_version`,
the eval-set reference, the wiki revision it was taken against, and aggregate
Recall@k, MRR and stale-result rate. The artifact is informational and SHALL
NOT gate any check.

#### Scenario: Baseline is present and well-formed

- **GIVEN** the committed baseline artifact
- **WHEN** its JSON is parsed
- **THEN** `schema_version`, eval-set reference, wiki revision and all three
  aggregate metrics are present
- **AND** no CI job fails on its values

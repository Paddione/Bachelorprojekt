## ADDED Requirements

### Requirement: Stale test files SHALL be removed when superseded

When a BATS test file in `tests/local/` has been fully consolidated into `tests/spec/software-factory.bats`, the legacy file SHALL be removed to prevent test duplication and false positives.

#### Scenario: Legacy test removed after consolidation
- **GIVEN** a legacy FA-SF-20 test in `tests/local/FA-SF-20-pipeline-contract.bats`
- **AND** `tests/spec/software-factory.bats` contains identical tests with corrected references
- **WHEN** the legacy file is removed
- **THEN** `task test:factory` SHALL pass without failures
- **AND** `task test:changed` SHALL pass when `scripts/factory/*` is touched

### Requirement: Test inventory references SHALL match existing files

Generated indexes and inventories (`docs/code-quality/repo-index.json`, `website/src/data/test-inventory.json`) SHALL only reference test files that exist on disk.

#### Scenario: Inventory updated after file removal
- **GIVEN** `tests/local/FA-SF-20-pipeline-contract.bats` is removed
- **WHEN** inventory files are regenerated
- **THEN** `docs/code-quality/repo-index.json` SHALL NOT reference the removed file
- **AND** `website/src/data/test-inventory.json` SHALL NOT reference the removed file

# batch-openspec-tooling-fixes

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu batch-openspec-tooling-fixes ergänzen._

## Requirements

### Requirement: The propose tasks.md skeleton seeds the test path in directory form

`openspec.sh propose` SHALL seed the `tasks.md` skeleton's example test command as a directory path in T002416 convention form — `tests/spec/<delta-spec-name>/` where the directory is named after the parent SSOT spec slug (`--target-spec`, defaulting to the change slug) — and SHALL NOT suggest the legacy collection-file form `tests/spec/<slug>.bats`. A plan author who follows the seed thus creates their test file under `tests/spec/<spec-slug>/<kurz-slug>.bats` instead of appending to a shared collection file.

#### Scenario: Propose without --target-spec seeds the change-slug directory

- **GIVEN** a fresh `openspec.sh propose my-fix --ticket T999999` against a temporary OPENSPEC_ROOT
- **WHEN** the resulting `tasks.md` skeleton is inspected
- **THEN** the example test command reads `bats tests/spec/my-fix/`
- **AND** the legacy form `tests/spec/my-fix.bats` appears nowhere in the skeleton

#### Scenario: Propose with --target-spec seeds the parent SSOT slug directory

- **GIVEN** `openspec.sh propose my-fix --ticket T999999 --target-spec openspec-workflow`
- **WHEN** the resulting `tasks.md` skeleton is inspected
- **THEN** the example test command reads `bats tests/spec/openspec-workflow/`
- **AND** the seed names the directory after the parent SSOT slug, not after the change slug

<!-- merged from change delta batch-openspec-tooling-fixes.md (ff8e4ff10217) -->
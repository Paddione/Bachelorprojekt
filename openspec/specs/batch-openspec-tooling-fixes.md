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

### Requirement: MODIFIED delta truncation is detected at merge time

The openspec delta merger SHALL detect when a requirement delta that replaces an existing
SSOT requirement carries fewer scenarios than the requirement it replaces. Such a delta is
a full replacement text — dropping scenarios without stating their removal is almost
always an authoring error (observed loss: PR #4440 deleted six scenarios from
`software-factory.md`). The merger SHALL warn on stderr and fail the merge when the
scenario count of a replacing delta is lower than the SSOT requirement's count, unless the
caller passes an explicit `allowShrink` flag for deliberate consolidations. This applies
to the explicit MODIFIED operation and to an ADDED delta whose requirement already exists
in the SSOT (auto-converted to a MODIFIED replacement). A genuine ADDED of a new
requirement and RENAMED operations are unaffected.

#### Scenario: truncating MODIFIED delta fails without allowShrink

- **GIVEN** a MODIFIED delta whose requirement carries fewer scenarios than the SSOT requirement
- **WHEN** `applyDelta` merges it without an allow-shrink flag
- **THEN** the merge fails, a warning naming the requirement and the counts is written to
  stderr, and the SSOT is left unchanged

#### Scenario: complete MODIFIED delta merges normally

- **GIVEN** a MODIFIED delta carrying the full requirement text (all scenarios present)
- **WHEN** `applyDelta` merges it
- **THEN** the merge succeeds and the SSOT requirement is replaced

#### Scenario: allowShrink permits a deliberate consolidation

- **GIVEN** a MODIFIED delta that deliberately reduces the scenario count
- **WHEN** `applyDelta` merges it with the explicit allow-shrink flag
- **THEN** the merge succeeds and the warning is still emitted

#### Scenario: ADDED delta against an existing requirement is guarded too

- **GIVEN** an ADDED delta whose requirement already exists in the SSOT and carries fewer scenarios than the SSOT requirement
- **WHEN** `applyDelta` auto-converts it to a MODIFIED replacement without an allow-shrink flag
- **THEN** the merge fails, a warning is written to stderr, and the SSOT is left unchanged

<!-- merged from change delta batch-openspec-tooling-fixes.md (e5654ee25551) -->
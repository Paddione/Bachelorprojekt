# openspec-upstream-cli

## Purpose

Beschreibt die Delta-Merge-Funktionalität für operation-bewusste MODIFIED/REMOVED/RENAMED-Operationen im OpenSpec-Workflow.

## Requirements

### Requirement: Delta-merge handles MODIFIED operation in-place

The system SHALL, when archiving a change whose delta spec contains a
`## MODIFIED Requirements` section, find each named `### Requirement: <name>` block in
the corresponding SSOT spec and replace it in-place with the updated content from the delta.
The old block SHALL NOT remain in the SSOT after archiving.

#### Scenario: MODIFIED requirement is replaced, not duplicated

- **GIVEN** a SSOT spec at `openspec/specs/ci-cd.md` containing `### Requirement: Block A`
- **AND** a delta spec with `## MODIFIED Requirements` / `### Requirement: Block A` (new content)
- **WHEN** `task openspec:archive -- <slug>` is run
- **THEN** `openspec/specs/ci-cd.md` contains exactly one `### Requirement: Block A` block
- **AND** the block content matches the delta (new content), not the original

#### Scenario: MODIFIED with nonexistent target fails with error

- **GIVEN** a delta spec with `## MODIFIED Requirements` / `### Requirement: NonExistent`
- **AND** `openspec/specs/target.md` has no such requirement
- **WHEN** `task openspec:archive -- <slug>` is run
- **THEN** the command fails with exit code 1 and an error message naming the missing block
- **AND** the SSOT is not modified

---

### Requirement: Delta-merge handles REMOVED operation by deletion

The system SHALL, when archiving a change whose delta spec contains a
`## REMOVED Requirements` section, find each named `### Requirement: <name>` block in the
SSOT and delete it. The block SHALL NOT be appended or retained in the SSOT.

#### Scenario: REMOVED requirement is deleted from SSOT

- **GIVEN** a SSOT spec containing `### Requirement: Deprecated Feature`
- **AND** a delta spec with `## REMOVED Requirements` / `### Requirement: Deprecated Feature`
- **WHEN** `task openspec:archive -- <slug>` is run
- **THEN** `openspec/specs/target.md` no longer contains `### Requirement: Deprecated Feature`

#### Scenario: REMOVED with nonexistent target fails with error

- **GIVEN** a delta spec with `## REMOVED Requirements` / `### Requirement: Ghost`
- **AND** the SSOT has no such block
- **WHEN** `task openspec:archive -- <slug>` is run
- **THEN** the command fails with exit code 1
- **AND** the SSOT is not modified

---

### Requirement: Delta-merge handles RENAMED operation

The system SHALL support a `## RENAMED Requirements` section in delta specs. When archiving,
each named `### Requirement: <old-name>` block in the SSOT SHALL have its heading line
updated to `### Requirement: <new-name>` as specified by the `**Renamed-to:** <new-name>`
directive in the delta. The block content SHALL remain unchanged.

#### Scenario: RENAMED requirement heading is updated

- **GIVEN** a SSOT spec with `### Requirement: Legacy Name`
- **AND** a delta with `## RENAMED Requirements` / `### Requirement: Legacy Name` /
  `**Renamed-to:** Modern Name`
- **WHEN** `task openspec:archive -- <slug>` is run
- **THEN** the SSOT has `### Requirement: Modern Name` and not `### Requirement: Legacy Name`
- **AND** the block body is unchanged

#### Scenario: RENAMED without Renamed-to directive fails validation

- **GIVEN** a delta with `## RENAMED Requirements` / `### Requirement: Old Name` but no
  `**Renamed-to:**` line
- **WHEN** `task openspec:validate` is run
- **THEN** validation fails with "missing Renamed-to directive"

---

### Requirement: Validator rejects stub requirements

The system SHALL reject any delta spec that still contains the unedited skeleton placeholders
seeded by `openspec.sh propose`. A delta with `### Requirement: TODO`, body line
`The system SHALL …`, or `#### Scenario: TODO` SHALL fail `task openspec:validate` with
a clear error message.

#### Scenario: Unedited skeleton fails CI gate

- **GIVEN** a delta spec whose content is exactly the `propose`-seeded skeleton (unchanged)
- **WHEN** `task test:openspec` runs (which invokes `scripts/openspec-validate.ts`)
- **THEN** validation reports "contains unedited stub requirement 'TODO'" and exits non-zero

#### Scenario: Edited skeleton passes validation

- **GIVEN** a delta spec where `### Requirement: TODO` has been replaced with a real name
  and the body does not contain `The system SHALL …` (unexpanded) or `#### Scenario: TODO`
- **WHEN** `task test:openspec` runs
- **THEN** validation passes without stub-related errors

---

### Requirement: Validator cross-references MODIFIED and REMOVED targets

The system SHALL, when validating a delta spec that contains MODIFIED or REMOVED sections,
verify that each named `### Requirement: <name>` exists in the corresponding SSOT spec
under `openspec/specs/<capability>.md`. A mismatch SHALL cause `task openspec:validate`
to fail with an error identifying the missing target.

#### Scenario: MODIFIED with matching SSOT target passes validation

- **GIVEN** a delta with `## MODIFIED Requirements` / `### Requirement: Existing Block`
- **AND** `openspec/specs/target.md` contains `### Requirement: Existing Block`
- **WHEN** `task openspec:validate` runs
- **THEN** validation passes for that delta

#### Scenario: MODIFIED with nonexistent SSOT target fails validation

- **GIVEN** a delta with `## MODIFIED Requirements` / `### Requirement: Typo Name`
- **AND** `openspec/specs/target.md` has no such block
- **WHEN** `task openspec:validate` runs
- **THEN** validation fails with "MODIFIED target 'Typo Name' not found in openspec/specs/target.md"

---

### Requirement: Validator accepts RENAMED as a valid operation

The system SHALL treat `## RENAMED Requirements` as a valid operation header in delta specs,
alongside ADDED, MODIFIED, and REMOVED. A delta file whose only section header is
`## RENAMED Requirements` SHALL pass the "at least one valid operation" check.

#### Scenario: Delta with only RENAMED section passes operation check

- **GIVEN** a delta spec containing `## RENAMED Requirements` and one or more
  `### Requirement:` entries with `**Renamed-to:** <name>` directives
- **WHEN** `task openspec:validate` runs
- **THEN** the delta passes the operation-presence check (no "missing ADDED|MODIFIED|REMOVED" error)

<!-- merged from change delta openspec-upstream-cli.md on 2026-06-28 -->
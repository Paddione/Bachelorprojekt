## ADDED Requirements

### Requirement: Archiving a change checks the declared deliverable is present, not only the ticket status

`scripts/openspec.sh archive` (`cmd_archive`) SHALL, in addition to its existing ticket-status
guard (status must be `done` or `archived`), read the linked ticket's `touched_files` and
compare each declared path against the working tree being archived from.

If `touched_files` is empty or unset, the command SHALL proceed and print an advisory noting
that deliverable presence could not be machine-checked for this change.

If `touched_files` is non-empty and at least one, but not all, declared paths exist, the
command SHALL proceed and print a warning naming the missing paths.

If `touched_files` is non-empty and none of the declared paths exist, the command SHALL refuse
to archive (non-zero exit, no move into `openspec/changes/archive/`, no delta merge into the
SSOT spec).

Rationale: a `done`/`archived` ticket status is a label a session can set incorrectly or
prematurely; it does not by itself prove the change's deliverable ever landed on the tree being
archived. On 2026-08-09, PR #3919 archived a change and merged its delta into the SSOT spec
while the change's actual deliverable (a spec-file assertion and two BATS guards) was still on
an open, unmerged PR — the ticket-status guard alone could not catch this because the ticket's
status label did not encode deliverable presence. The check is intentionally graded (advisory
for missing data, warning for partial drift, hard refusal only for total absence) because a
plan's declared files can legitimately evolve between staging and archiving without that being
a bug; failing closed on any single missing path would make the guard worse than no guard by
forcing operators to fight false positives on ordinary drift.

#### Scenario: Archive proceeds when all declared touched_files are present

- **GIVEN** a change whose linked ticket has status `done` and a non-empty `touched_files` list
- **AND** every declared path exists in the working tree
- **WHEN** `scripts/openspec.sh archive <slug>` runs
- **THEN** the archive proceeds and the change is moved into `openspec/changes/archive/`

#### Scenario: Archive is refused when none of the declared touched_files are present

- **GIVEN** a change whose linked ticket has status `done` and a non-empty `touched_files` list
- **AND** none of the declared paths exist in the working tree
- **WHEN** `scripts/openspec.sh archive <slug>` runs
- **THEN** the command exits non-zero
- **AND** the change directory is not moved into `openspec/changes/archive/`
- **AND** no delta is merged into the SSOT spec

#### Scenario: Archive proceeds with a warning when some declared touched_files are missing

- **GIVEN** a change whose linked ticket has status `done` and a `touched_files` list with at
  least two entries
- **AND** at least one declared path exists and at least one does not
- **WHEN** `scripts/openspec.sh archive <slug>` runs
- **THEN** the archive proceeds
- **AND** the output names the missing path(s) as a warning

#### Scenario: Archive proceeds with an advisory when touched_files carries no data

- **GIVEN** a change whose linked ticket has status `done` and an empty or unset `touched_files`
- **WHEN** `scripts/openspec.sh archive <slug>` runs
- **THEN** the archive proceeds
- **AND** the output prints an advisory that deliverable presence could not be machine-checked

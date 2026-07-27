## ADDED Requirements

### Requirement: Plan pre-flight resolves against the named branch

`ticket.sh stage-plan` SHALL accept a plan path that exists on the branch given by
`--branch`, even when the command runs from a checkout whose `HEAD` does not contain
it. The pre-flight SHALL try, in order, the branch ref, then `HEAD`, then the working
tree, and SHALL reject the plan only when all three fail.

#### Scenario: Plan lives only on the feature branch

- **GIVEN** a repository whose `HEAD` is `main` and whose branch `feature/x` contains
  `openspec/changes/demo/tasks.md`
- **WHEN** `ticket.sh stage-plan --branch feature/x --plan openspec/changes/demo/tasks.md`
  runs from that checkout
- **THEN** the pre-flight does not report the plan as missing

#### Scenario: Plan exists nowhere

- **GIVEN** a plan path present neither on the named branch nor in `HEAD` nor on disk
- **WHEN** `ticket.sh stage-plan` runs
- **THEN** it exits 1 and reports that the plan does not exist

#### Scenario: Uncommitted plan called from its own worktree

- **GIVEN** a plan file present on disk but not yet committed to any branch
- **WHEN** `ticket.sh stage-plan` runs from the directory containing it
- **THEN** the pre-flight passes, preserving the existing working-tree fallback

### Requirement: Archive pre-flight resolves against the named branch

`ticket.sh archive-plan` SHALL accept a `--plan-file` that exists on the branch given by
`--branch` when the file is not readable in the current working tree, and SHALL keep
rejecting a plan file that is neither on the branch nor a non-empty file on disk.

#### Scenario: Archiving a plan from the main checkout

- **GIVEN** `--plan-file` names a path that exists only on the branch passed as `--branch`
- **WHEN** `ticket.sh archive-plan` runs from a checkout without that file
- **THEN** it does not abort with a missing-plan-file error

#### Scenario: Empty plan file is still rejected

- **GIVEN** a `--plan-file` that exists on disk but is empty, and no matching branch entry
- **WHEN** `ticket.sh archive-plan` runs
- **THEN** it exits 1 and reports the empty or missing plan file

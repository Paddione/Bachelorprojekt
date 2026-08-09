## ADDED Requirements

### Requirement: Rollup container is resolved through a single shared entry point

Both the mishap flush (`ticket-mcp`) and the rollup driver
(`scripts/factory/mishap-rollup.sh`) SHALL resolve the rollup container through the same
entry point, `scripts/ticket.sh rollup-container`. Neither side SHALL implement its own
container lookup. The entry point SHALL return an existing container whose status is open,
and SHALL create one when none exists, so that the "no container found" state cannot occur.

#### Scenario: Shared entry point is exposed by the ticket CLI

- **GIVEN** a developer runs `scripts/ticket.sh` without arguments
- **WHEN** the command list is printed
- **THEN** it SHALL contain `rollup-container`

#### Scenario: A closed container is never selected

- **GIVEN** one or more containers exist whose status is `done` or `archived`
- **AND** no container with an open status exists
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs
- **THEN** it SHALL NOT return any of the closed containers
- **AND** it SHALL create a new container with an open status and return its external id

#### Scenario: Selection is deterministic when several open containers exist

- **GIVEN** more than one container with an open status carries the rollup title
- **WHEN** `scripts/ticket.sh rollup-container --brand <brand>` runs twice in a row
- **THEN** both invocations SHALL return the same external id

### Requirement: Worktree creation supports unattended callers

`scripts/worktree-create.sh` SHALL provide an `--unattended` mode for callers that run
without an operator, such as the factory tick. In this mode the script SHALL NOT require
the main checkout to be on the main branch, and SHALL accept an allowlisted persistent
branch that carries no ticket id. All other guards, including git-crypt handling, SHALL
remain in force.

#### Scenario: Help answers before any guard runs

- **GIVEN** the main checkout is on a branch other than main
- **WHEN** `scripts/worktree-create.sh --help` runs
- **THEN** it SHALL exit with status 0
- **AND** its output SHALL NOT contain a fatal guard message
- **AND** its output SHALL document the `--unattended` option

#### Scenario: Unattended run succeeds off the main branch

- **GIVEN** the main checkout is on a branch other than main
- **WHEN** `scripts/worktree-create.sh --unattended <allowlisted-branch> <path>` runs
- **THEN** the worktree SHALL be created
- **AND** the run SHALL NOT fail on the branch naming convention

### Requirement: The rollup driver reports work it did not do

`scripts/factory/mishap-rollup.sh` SHALL NOT report success for a run in which it neither
generated nor updated a plan because it could not reach its container. Since the shared
entry point creates a container when none exists, reaching that state indicates a genuine
failure and SHALL be reported as a non-zero exit.

#### Scenario: Unreachable container is a failure, not a no-op

- **GIVEN** the shared entry point cannot return a container
- **WHEN** the rollup driver runs
- **THEN** it SHALL exit with a non-zero status
- **AND** its output SHALL distinguish this state from the no-op case in which no new
  batches were present

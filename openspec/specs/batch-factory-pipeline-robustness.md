# batch-factory-pipeline-robustness

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu batch-factory-pipeline-robustness ergänzen._

## Requirements

### Requirement: The factory stops dispatching a plan after three consecutive no-commit runs

The factory pipeline SHALL count consecutive implementation runs that end with exit 6 (no commit and no working-tree change) per ticket via `ticket.sh retry-count`. A run that produced a commit SHALL reset the counter. After three consecutive no-commit runs, the factory SHALL reset the ticket to `planning`, release the pipeline slot, free the worktree (best-effort), and leave a comment explaining that the plan is not implementable with the current setup — instead of re-dispatching the same ticket forever.

#### Scenario: Three consecutive exit-6 runs stop the retry loop

- **GIVEN** a ticket whose first three factory runs each end with exit 6 (no implementation commit, no working-tree change)
- **WHEN** the third run finishes its exit-6 handling
- **THEN** the ticket status is `planning`, the pipeline slot is released, the worktree is removed, and a comment documents the reset
- **AND** the retry counter is reset so a later re-dispatch starts fresh

#### Scenario: A successful commit resets the counter

- **GIVEN** a ticket with two consecutive exit-6 runs (counter at 2)
- **WHEN** the next run produces an implementation commit
- **THEN** the retry counter is reset to 0 and the ticket proceeds normally

### Requirement: The FACTORY_CTX default is visible immediately on sourcing lib.sh

`scripts/factory/lib.sh` SHALL resolve the `FACTORY_CTX` default (`k3d-mentolder-dev`) at top level, so that merely sourcing the file exposes a valid context. The default SHALL NOT wait until `factory_resolve_data_ns` runs, and the explicit override via `FACTORY_CTX` SHALL remain honored.

#### Scenario: Sourcing lib.sh alone exposes a valid context

- **GIVEN** an environment without `FACTORY_CTX` set
- **WHEN** a script sources `scripts/factory/lib.sh`
- **THEN** `FACTORY_CTX` is already `k3d-mentolder-dev` without calling `factory_resolve`
- **AND** a later explicit `FACTORY_CTX=...` override still wins

<!-- merged from change delta batch-factory-pipeline-robustness.md (07323eba4915) -->
## ADDED Requirements

### Requirement: Batch processing of multiple pull requests in one run

`scripts/pr-refresh.sh` SHALL process every pull request number given on the command line. A refusal SHALL skip only the affected pull request and SHALL NOT terminate the run. The run SHALL end with a balance line reporting how many pull requests were healed, skipped and refused. The exit code SHALL be non-zero if at least one pull request was refused, so automation still observes the refusal.

Rationale: refusals are the normal case, not the exception. When the batch entry point was first used for real, three of four CONFLICTING pull requests were held by checked-out worktrees. With a terminating guard, the documented invocation `task pr:refresh -- 3448 3446 3442` never got past the first number.

#### Scenario: A refused pull request does not end the run

- **GIVEN** two pull request numbers, the first of which a guard refuses
- **WHEN** `pr-refresh.sh <first> <second>` runs
- **THEN** the refusal of the first is reported
- **AND** the second pull request is still evaluated
- **AND** the exit code is non-zero

#### Scenario: The run reports a balance

- **GIVEN** three pull requests — one already mergeable, one refused, one healable
- **WHEN** the batch run finishes
- **THEN** a balance line reports one healed, one skipped and one refused

#### Scenario: A run without refusals exits zero

- **GIVEN** pull request numbers that are all skipped or healed
- **WHEN** the batch run finishes
- **THEN** the exit code is zero

#### Scenario: An unreachable pull request skips only itself

- **GIVEN** a pull request number that cannot be fetched
- **WHEN** it is followed by a further number in the same run
- **THEN** the fetch failure is reported for that number only
- **AND** the following pull request is still evaluated

#### Scenario: A failed rebase leaves no worktree behind

- **GIVEN** a pull request whose `rebase --continue` fails
- **WHEN** the run continues with the remaining numbers
- **THEN** the temporary worktree is removed
- **AND** the branch is no longer checked out, so a later retry is not refused by the checkout guard

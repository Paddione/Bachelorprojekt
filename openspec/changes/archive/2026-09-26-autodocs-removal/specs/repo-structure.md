## MODIFIED Requirements

### Requirement: Moves are atomic with reference updates

Every directory move in this change SHALL happen as a single atomic commit that combines
the `git mv` with all reference updates. After each move, a fixed-string grep for the
old path over the repository
MUST return no stale references.

#### Scenario: Each move is self-contained

- **GIVEN** any single commit of the reorg series
- **WHEN** the commit is checked out
- **THEN** CI gates (`test:inventory`, Taskfile dry-run, workspace validation) are green
  at that commit
- **AND** a fixed-string grep for the old path of the moved directory returns no matches
  outside the moved content itself

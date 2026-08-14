## ADDED Requirements

### Requirement: The worktree write guard permits Phase-A proposal paths on main during concurrent session work

`scripts/hooks/worktree-write-guard.sh` SHALL permit write operations to Phase-A proposal paths in the main checkout (`$MAIN_ROOT/openspec/changes/*` and `$MAIN_ROOT/.lavish/*`) even when one or more active worktree claims exist for the caller's session ID (`SID`). All other writes to the main checkout outside the claimed worktree(s) SHALL remain blocked.

#### Scenario: Phase-A proposal files on main are allowed despite existing own worktree claim

- **GIVEN** an active branch worktree claim held under the caller's SID
- **WHEN** a tool write targets `$MAIN_ROOT/openspec/changes/<slug>/proposal.md` in the main checkout
- **THEN** the write guard exits 0 (permitted)

#### Scenario: Phase-A lavish files on main are allowed despite existing own worktree claim

- **GIVEN** an active branch worktree claim held under the caller's SID
- **WHEN** a tool write targets `$MAIN_ROOT/.lavish/<slug>-brainstorm.html` in the main checkout
- **THEN** the write guard exits 0 (permitted)

#### Scenario: Non-Phase-A files in main checkout remain blocked

- **GIVEN** an active branch worktree claim held under the caller's SID
- **WHEN** a tool write targets `$MAIN_ROOT/scripts/some-script.sh` in the main checkout
- **THEN** the write guard exits 2 (rejected)


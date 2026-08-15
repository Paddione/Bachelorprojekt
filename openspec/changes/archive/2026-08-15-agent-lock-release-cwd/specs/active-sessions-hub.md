## ADDED Requirements

### Requirement: Branch-scoped release refuses while the cwd is inside the lock's worktree

`scripts/agent-lock.sh release branch <b>` SHALL refuse (exit 1) and leave the lock in
place when the lock's `worktree` field is set and the caller's current working directory
(or its git toplevel) lies within that worktree path. The refusal SHALL state the reason
and the remedy on stderr: run the release from the main repo, because the documented
next step (`git worktree remove`) destroys the shell's cwd and kills every later command
in the session.

The containment test SHALL mirror the ownership predicate of `_lock_is_mine` (T003110):
exact match or prefix match on both `$PWD` and `git rev-parse --show-toplevel`, so a
caller in a subdirectory of the worktree is refused just like a caller at its root.

An explicit `--force` SHALL override the refusal, preserving the legitimate case where
the lock is released while the worktree is kept. A lock without a usable `worktree`
field SHALL release as before. Ticket-scoped releases are unaffected.

#### Scenario: Release from inside the lock's worktree is refused

- **GIVEN** a branch-scoped lock `branch__fix-demo-T000123.json` recording `worktree=<wt>` owned by the current session
- **WHEN** `bash scripts/agent-lock.sh release branch fix/demo-T000123` runs with the working directory at `<wt>` or any subdirectory of it
- **THEN** the command exits with status 1
- **AND** stderr names the reason (cwd inside the worktree) and the remedy (release from the main repo)
- **AND** the lock file still exists

#### Scenario: Release from the main repo succeeds while the worktree exists

- **GIVEN** the same branch-scoped lock recording `worktree=<wt>`
- **WHEN** the release runs with the working directory outside `<wt>` (e.g. the main repo root)
- **THEN** the command exits with status 0 and the lock file is removed

#### Scenario: Release with --force succeeds from inside the worktree

- **GIVEN** the same branch-scoped lock recording `worktree=<wt>`
- **WHEN** the caller runs `bash scripts/agent-lock.sh release branch fix/demo-T000123 --force` with the working directory at `<wt>`
- **THEN** the command exits with status 0 and the lock file is removed

#### Scenario: Ticket-scoped release is unaffected by the cwd guard

- **GIVEN** a ticket-scoped lock `ticket__T000123.json` recording `worktree=<wt>`
- **WHEN** `bash scripts/agent-lock.sh release ticket T000123` runs with the working directory at `<wt>`
- **THEN** the command exits with status 0 and the lock file is removed

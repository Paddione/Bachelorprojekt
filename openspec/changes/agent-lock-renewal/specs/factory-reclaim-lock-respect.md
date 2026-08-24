## ADDED Requirements

### Requirement: Session-scoped heartbeat renewal command

`agent-lock` SHALL provide a `heartbeat` command that renews the
`heartbeat_at` timestamp of EVERY lock owned by the calling session (matched
via `_lock_is_mine`: owner_sid or worktree containment), across all scopes
(ticket, branch, worktree, main-checkout), without requiring scope/id
arguments or a re-claim ritual.

#### Scenario: All own locks renewed in one call

- **GIVEN** a session holds a ticket lock and a branch lock with recorded
  worktree paths
- **WHEN** the session runs `bash scripts/agent-lock.sh heartbeat`
- **THEN** both locks' `heartbeat_at` timestamps are updated to now
- **AND** identity fields (owner_sid, owner_pid, created_at, branch,
  worktree) remain unchanged

#### Scenario: Foreign locks are untouched

- **GIVEN** another live session owns a lock on a different ticket
- **WHEN** the calling session runs `agent-lock.sh heartbeat`
- **THEN** the foreign lock's `heartbeat_at` remains unchanged

#### Scenario: Fail-open without locks

- **GIVEN** no lock directory exists or no lock belongs to the caller
- **WHEN** the caller runs `agent-lock.sh heartbeat`
- **THEN** the command exits 0 and reports zero renewals

### Requirement: Renewal call points for long operations

Long-running workflow steps that may exceed the lock TTL without an
intermediate commit SHALL trigger a heartbeat renewal: dev-flow-execute
instructs sessions to run `agent-lock.sh heartbeat` before starting and after
finishing long test phases, and local long-running Taskfile targets invoke it
best-effort at task start.

#### Scenario: Execute session renews around long test phases

- **GIVEN** dev-flow-execute documents its long-operation protocol
- **WHEN** a session prepares to run a test suite expected to take more than
  ~5 minutes without committing
- **THEN** it runs `bash scripts/agent-lock.sh heartbeat` before and after
  the run, keeping its locks non-reapable throughout

#### Scenario: CI-safe invocation inside Taskfile targets

- **GIVEN** a CI runner has neither agent-locks nor a main checkout
- **WHEN** a long-running local test target executes its best-effort
  heartbeat step
- **THEN** the step fails open and the target proceeds normally

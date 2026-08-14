# scripts — Delta (T005560)

## ADDED Requirements

### Requirement: agent-lock check unterscheidet tote Halter

The system SHALL report a ticket lock whose `owner_pid` is dead as `held-stale` with exit code 4 from `agent-lock.sh check ticket <id>`, while leaving the lock file in place.

The system SHALL keep exit code 3 (`held`) for locks whose holder process is alive, and exit code 0 (`free`) for reaped or absent locks.

#### Scenario: dead holder is reported as held-stale

- **GIVEN** a ticket lock with a dead `owner_pid`, a fresh heartbeat and a matching existing worktree and branch
- **WHEN** the caller runs `agent-lock.sh check ticket <id>`
- **THEN** the command exits with code 4 and prints `held-stale`

#### Scenario: live holder is reported as held

- **GIVEN** a ticket lock whose `owner_pid` is alive
- **WHEN** the caller runs `agent-lock.sh check ticket <id>`
- **THEN** the command exits with code 3 and prints `held`

### Requirement: ticket write guard passes through stale holders

The system SHALL let ticket status writes pass through with a warning when the ticket lock guard observes exit code 4 (`held-stale`) from `agent-lock.sh check`, because a dead holder provides no protection against duplicate work. Exit code 3 (`held` by a live session) SHALL keep blocking non-closure writes.

## ADDED Requirements

### Requirement: Activity heartbeat keeps claims alive

The guard hooks SHALL renew the `heartbeat_at` timestamp of a matching lock
entry on every pre-commit / post-checkout activity, and this renewal SHALL be
best-effort (fail-open).

#### Scenario: Commit erneuert den Herzschlag

- **GIVEN** a lock exists for worktree W with an old `heartbeat_at`
- **WHEN** any session runs a commit inside W (guard-precommit fires)
- **THEN** the matching lock's `heartbeat_at` is updated to now
- **AND** a subsequent reap evaluation keeps the lock despite expired TTL.

#### Scenario: Fehlender Store fail-open

- **GIVEN** the lock store is missing or unreadable
- **WHEN** a guard hook attempts the heartbeat renewal
- **THEN** it emits a warning and exits 0
- **AND** the user's git operation proceeds unaffected.

### Requirement: Active-process check precedes pid-based reap

For worktree-matched locks, `_reapable` SHALL consult the existing active-
process probe before any pid-dead or sid-dead reap decision.

#### Scenario: Aktiver Worktree-Prozess schützt vor pid-dead-Reap

- **GIVEN** a lock for worktree W with dead recorded `owner_pid`,
        age beyond `AGENT_LOCK_GRACE`, and expired `heartbeat_at`
- **AND** at least one process has its cwd inside W
- **WHEN** `reap` (or `list` staleness marking) evaluates the lock
- **THEN** the lock is kept and the decision is logged as kept-live-worktree.

#### Scenario: Wirklich tote Halter werden weiterhin geerntet

- **GIVEN** the same stale lock situation
- **AND** no process cwd resides inside W
- **WHEN** `reap` evaluates the lock
- **THEN** the lock is removed with reason `pid-dead` as today.

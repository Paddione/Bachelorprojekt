# Delta: factory-watchdog

## ADDED Requirements

### Requirement: Recency spare before zombie verdict

The watchdog MUST NOT remove an unclaimed `sf-*` worktree as a zombie when recent
activity is associated with it. Recent activity is any of:

- a live process whose `/proc/*/cwd` lies inside the worktree, OR
- an activity-ledger entry for the worktree within the recency threshold
  (`WATCHDOG_RECENCY_MIN`, default 10 minutes), OR
- a lock whose recorded `worktree` field matches the worktree and whose
  `heartbeat_at` is within the threshold — even if that lock itself is reapable.

When the probe is positive, the watchdog MUST leave the worktree in place and record
a bounce comment stating the spare reason instead of deleting it.

#### Scenario: Live process inside the worktree spares it

- **GIVEN** a stale ticket with an unclaimed `sf-*` worktree containing no uncommitted changes
- **AND** a process with cwd inside that worktree exists at sweep time
- **WHEN** the watchdog runs its zombie cleanup
- **THEN** the worktree is not removed
- **AND** a comment records that the worktree was spared (active process)

#### Scenario: Recent ledger activity within threshold spares it

- **GIVEN** a stale ticket with an unclaimed `sf-*` worktree and no live process inside it
- **AND** an activity-ledger entry for that worktree younger than 10 minutes exists
- **WHEN** the watchdog runs its zombie cleanup
- **THEN** the worktree is not removed

#### Scenario: Silent worktree past the threshold is removed

- **GIVEN** a stale ticket with an unclaimed `sf-*` worktree
- **AND** no process cwd inside it, no ledger entry within the threshold, and no
  lock heartbeat within the threshold referencing it
- **WHEN** the watchdog runs its zombie cleanup
- **THEN** the worktree is removed as before

### Requirement: Serialized destructive reap paths

The heartbeat-ttl reap path (`agent-lock.sh reap`) and the watchdog zombie purge MUST
NOT both perform destructive actions on the same ticket/worktree within one window.
Both paths take a shared flock around their read-decide-delete sequence; whichever
actor runs second observes the state left by the first and aborts without a second
destructive write.

#### Scenario: Concurrent reap and purge on the same worktree

- **GIVEN** a lock that is heartbeat-reapable and whose worktree qualifies as a zombie
- **WHEN** `agent-lock.sh reap` and the watchdog cleanup address them concurrently
- **THEN** exactly one actor performs the destructive action
- **AND** the other logs its decision and leaves the remaining state consistent

### Requirement: Watchdog test sweeps stay isolated

A watchdog run under test MUST only see tickets seeded by the test fixture
(factory-test marker) and MUST NOT reset or reap operator tickets; this also holds for
the new recency-spare and serialization code paths.

#### Scenario: Recency-spare sweep ignores real tickets

- **GIVEN** a watchdog test run with `FACTORY_STALE_EXCLUDE_TEST_SEEDS=0`
- **WHEN** the sweep evaluates stale tickets
- **THEN** only factory-test-marked tickets are considered

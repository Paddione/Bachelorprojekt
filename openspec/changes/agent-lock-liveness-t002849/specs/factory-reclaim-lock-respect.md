## ADDED Requirements

### Requirement: A dead pid reaps a worktree-matched claim after the grace period

`scripts/agent-lock.sh` `_reapable()` SHALL treat a claim whose recorded `owner_pid` is dead
as reapable once its age (since `heartbeat_at`, falling back to `created_at`) reaches
`AGENT_LOCK_GRACE`, even when the claim's recorded `worktree` still exists and its `branch`
matches the worktree's current HEAD branch. Waiting for the full `AGENT_LOCK_TTL` in this case
blocks a legitimate reclaim for up to 30 minutes although the process is confirmed dead.

A claim younger than `AGENT_LOCK_GRACE` SHALL remain protected regardless of `owner_pid`
liveness — a session resume [T002204] starts a new process (new pid, possibly new sid) and
needs time to write its own refreshed heartbeat before the old claim's dead pid can be
distinguished from an in-flight resume.

#### Scenario: A worktree-matched claim with a dead pid reaps after the grace period

- **GIVEN** a ticket claim whose `owner_sid` cannot be resolved (dead or unresolvable), whose
  recorded `worktree` exists on disk with its current branch equal to the claim's `branch`
  field, whose `owner_pid` is not a running process, and whose age since `heartbeat_at` is at
  least `AGENT_LOCK_GRACE`
- **WHEN** `agent-lock.sh check ticket <id>` runs
- **THEN** it prints `free` and exits 0

#### Scenario: A fresh worktree-matched claim survives a dead pid

- **GIVEN** the same claim, but its age since `heartbeat_at` is under `AGENT_LOCK_GRACE`
- **WHEN** `agent-lock.sh check ticket <id>` runs
- **THEN** it still prints `held` — a session resume in flight is not yet distinguishable from
  a crashed holder, and the grace period protects it

#### Scenario: A worktree-matched claim with a live pid stays held regardless of age

- **GIVEN** a claim whose recorded worktree and branch match, and whose `owner_pid` is a
  running process, aged well past `AGENT_LOCK_GRACE`
- **WHEN** `agent-lock.sh check ticket <id>` runs
- **THEN** it still prints `held` — a live pid is proof of life independent of claim age

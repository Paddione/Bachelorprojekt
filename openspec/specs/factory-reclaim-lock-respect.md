# factory-reclaim-lock-respect

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu factory-reclaim-lock-respect ergänzen._

## Requirements

### Requirement: A live holder process keeps its agent-lock alive

`scripts/agent-lock.sh` SHALL treat a claim whose recorded `owner_pid` is still running as
live, regardless of whether the recorded `owner_sid` can be resolved. `_sid_alive` resolves
numeric session ids via `pgrep -s`, which does not find a Claude Code session id even while
that session is running; without this rule such a claim falls through to the `sid-dead` reap
path and `agent-lock.sh check` answers `free` for a lock a human is actively holding.

A claim whose `owner_pid` is dead SHALL remain reapable under the existing rules — a live
pid is proof of life, its absence is not proof of protection.

#### Scenario: A claim with a live pid is reported as held

- **GIVEN** a ticket claim whose `owner_sid` cannot be resolved, whose `created_at` is older
  than the grace period, and whose `owner_pid` is a running process
- **WHEN** `agent-lock.sh check ticket <id>` runs
- **THEN** it prints `held` and exits 3

#### Scenario: A live pid survives a missing worktree

- **GIVEN** the same claim, but its recorded worktree directory no longer exists
- **WHEN** `agent-lock.sh check ticket <id>` runs
- **THEN** it still prints `held` — a running holder outranks the `worktree-missing` reap

#### Scenario: A dead pid stays reapable

- **GIVEN** a ticket claim with an unresolvable `owner_sid` and a dead `owner_pid`, older
  than the grace period
- **WHEN** `agent-lock.sh check ticket <id>` runs
- **THEN** it prints `free` and exits 0

### Requirement: Branch-scoped claims record their branch

`scripts/agent-lock.sh claim branch <name>` SHALL record `<name>` in the claim's `branch`
field when no explicit `--branch` is given. For a branch-scoped claim the branch name is the
claim id, so callers never pass `--branch`; leaving the field empty disables the
worktree+branch liveness fallback, which requires a non-empty branch. An explicitly passed
`--branch` SHALL take precedence.

#### Scenario: Claiming a branch records the branch name

- **WHEN** `agent-lock.sh claim branch fix/demo-T000123 --worktree <path>` runs
- **THEN** the resulting lock file carries `"branch": "fix/demo-T000123"`

### Requirement: A staged ticket can be reclaimed for interactive work

`scripts/ticket.sh reclaim <id>` SHALL hand a ticket back to the calling session in one step:
release its pipeline slot, set its status to `plan_staged`, and place a ticket-scoped
agent-lock for the caller. The status SHALL NOT be set to `blocked` — the plan is complete
and nothing is blocking it.

Worker liveness SHALL be determined from `updated_at` using the same threshold as
`scripts/factory/watchdog.sh` (`FACTORY_STALE_MIN`, default 30 minutes). While a worker is
alive the command SHALL refuse and change nothing, reporting the slot, the status and the
age of the last progress; `--force` SHALL override. The implementation SHALL live in
`scripts/ticket-reclaim.sh`, dispatched from `ticket.sh`.

The existing session-coordination guard in `scripts/factory/factory-prep-runner.sh` and
`scripts/factory/factory-prep-bridge.sh` (T000510) SHALL remain unchanged — it is correct;
it was asking a lock that reported the wrong answer.

#### Scenario: Reclaiming a ticket with no active worker

- **GIVEN** a ticket that is `in_progress` with a pipeline slot and no progress beyond the
  staleness threshold
- **WHEN** `ticket.sh reclaim <id>` runs
- **THEN** the slot is released, the status becomes `plan_staged`, and the caller holds a
  ticket-scoped agent-lock

#### Scenario: Reclaiming is refused while a worker is alive

- **GIVEN** a ticket that is `in_progress` with a slot and recent progress
- **WHEN** `ticket.sh reclaim <id>` runs without `--force`
- **THEN** it exits non-zero, changes nothing, and reports slot, status and progress age

#### Scenario: Calling reclaim without a ticket id fails loudly

- **WHEN** `ticket.sh reclaim` runs with no arguments
- **THEN** it exits non-zero with a usage message rather than doing nothing silently

<!-- merged from change delta factory-reclaim-lock-respect.md (851852223ea5) -->

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

<!-- merged from change delta factory-reclaim-lock-respect.md (5d9bdcc73137) -->
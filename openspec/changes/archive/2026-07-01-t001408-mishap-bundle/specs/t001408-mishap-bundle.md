## ADDED Requirements

### Requirement: Agent-lock grace-period protects young claims from a dead numeric SID

The `scripts/agent-lock.sh` reap logic SHALL NOT reclaim a claim younger than `AGENT_LOCK_GRACE` seconds (default 120) solely because its numeric owner SID fails the `pgrep`-based liveness check. The heartbeat-TTL path (`AGENT_LOCK_TTL`, default 1800) SHALL remain the ultimate fallback for genuinely stale sessions, and the `worktree-missing` reap branch SHALL stay unconditional.

#### Scenario: A freshly created claim survives an unverifiable numeric SID

- **GIVEN** a claim created less than `AGENT_LOCK_GRACE` seconds ago whose numeric owner SID cannot be verified alive via `pgrep`
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the claim is NOT reaped and still appears in `agent-lock.sh list`

#### Scenario: A stale claim past the TTL is still reaped

- **GIVEN** a claim whose heartbeat is older than `AGENT_LOCK_TTL` seconds
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the claim is reaped despite the grace-period logic

### Requirement: Agent-lock records a reason for every reap

The `scripts/agent-lock.sh` reap logic SHALL append an audit line to `<lock-dir>/.reap.log` for every claim it classifies as reapable, recording a timestamp, the claim `scope/id`, and a reason of `worktree-missing`, `sid-dead`, or `heartbeat-ttl`. The write SHALL be fail-open (a write failure never changes reap behavior).

#### Scenario: A reaped claim leaves a reason line

- **GIVEN** a claim that is genuinely stale (heartbeat past the TTL)
- **WHEN** `agent-lock.sh reap` reclaims it
- **THEN** `<lock-dir>/.reap.log` contains a line naming that claim's id and a reap reason

### Requirement: CI watcher rebases a DIRTY PR before polling

The `scripts/devflow-ci-watch.sh` watcher SHALL query `gh pr view --json mergeStateStatus` before entering its CI polling loop and, on a `DIRTY` state, attempt `git fetch origin main && git rebase origin/main`. A clean rebase SHALL force-push with lease and continue polling; a rebase conflict SHALL abort the rebase and exit non-zero so the caller resolves it rather than hanging in the poll loop.

#### Scenario: DIRTY PR triggers a rebase before the poll loop

- **GIVEN** a PR whose `mergeStateStatus` is `DIRTY`
- **WHEN** `devflow-ci-watch.sh` starts
- **THEN** it attempts `git rebase origin/main` before the first CI poll attempt

#### Scenario: Rebase conflict exits instead of hanging

- **GIVEN** a DIRTY PR whose rebase against `origin/main` conflicts
- **WHEN** `devflow-ci-watch.sh` runs its preflight
- **THEN** it aborts the rebase and exits with a non-zero status distinct from the CI-red exit

### Requirement: CI watcher derives failed checks from a valid gh query

The `scripts/devflow-ci-watch.sh` watcher SHALL NOT invoke the non-existent `gh pr checks --json` flag and SHALL instead derive failed checks from `gh pr view --json statusCheckRollup`, handling both `CheckRun` (`conclusion`/`detailsUrl`) and `StatusContext` (`state`/`targetUrl`) node shapes.

#### Scenario: Failed checks come from statusCheckRollup

- **GIVEN** a PR with at least one failing check
- **WHEN** `devflow-ci-watch.sh` evaluates check status
- **THEN** it reads the failure from `gh pr view --json statusCheckRollup` and reports the check as failed rather than falsely reporting green

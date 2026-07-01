## ADDED Requirements

### Requirement: Agent-lock reaps claims whose owner PID is dead after the grace window

The `scripts/agent-lock.sh` reap logic SHALL check the `owner_pid` recorded in
the lock file: if the PID is non-empty, the lock is older than
`AGENT_LOCK_GRACE` seconds (default 120), and `kill -0 "$owner_pid"` fails
(process is dead), the claim SHALL be classified as reapable with reason
`pid-dead`. The reap reason SHALL be appended to `<lock-dir>/.reap.log` for
post-incident diagnosis. The `worktree-missing`, `sid-dead`, and
`heartbeat-ttl` reap branches remain unchanged and run after the new
`pid-dead` check.

#### Scenario: A dead owner PID older than the grace window is reaped

- **GIVEN** a lock file with `owner_pid = 99999` (a process that is no longer
  running) and `created_at` older than `AGENT_LOCK_GRACE` seconds
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the lock file is removed and `<lock-dir>/.reap.log` contains a
  line naming that claim's id and reason `pid-dead`

#### Scenario: A dead owner PID younger than the grace window is protected

- **GIVEN** a lock file with `owner_pid = 99999` (dead) and `created_at`
  younger than `AGENT_LOCK_GRACE` seconds
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the lock file is NOT reaped and still appears in
  `agent-lock.sh list`

#### Scenario: An empty owner_pid does not trigger the pid-dead reap

- **GIVEN** a legacy lock file with `owner_pid = ""` (no PID recorded)
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the pid-dead check is skipped and the existing reap branches
  (`worktree-missing`, `sid-dead`, `heartbeat-ttl`) decide the outcome

### Requirement: CI watcher aborts with a clear conflict message on a CONFLICTING PR

The `scripts/devflow-ci-watch.sh` watcher SHALL additionally query
`gh pr view --json mergeable` in its preflight. If `mergeable == "CONFLICTING"`
the script SHALL exit with code `4` and a stderr message naming "merge
conflicts" plus the suggestion to rebase manually — it SHALL NOT attempt an
auto-resolve (semantic merge conflicts cannot be safely auto-resolved). An
unknown or empty `mergeable` value SHALL be treated as "not conflicting" and
the normal poll loop SHALL proceed.

#### Scenario: CONFLICTING PR aborts with exit 4 and a conflict message

- **GIVEN** a PR whose `mergeable` field from `gh pr view --json mergeable` is
  `CONFLICTING`
- **WHEN** `devflow-ci-watch.sh` runs its preflight
- **THEN** the script writes a message containing the word "conflict" to
  stderr and exits with code `4`

#### Scenario: MERGEABLE PR continues into the poll loop

- **GIVEN** a PR whose `mergeable` field is `MERGEABLE`
- **WHEN** `devflow-ci-watch.sh` runs its preflight
- **THEN** the script does NOT exit and proceeds into the CI poll loop

#### Scenario: UNKNOWN mergeable state is treated as not conflicting

- **GIVEN** a PR whose `mergeable` field is `UNKNOWN` (GitHub has not yet
  evaluated mergeability)
- **WHEN** `devflow-ci-watch.sh` runs its preflight
- **THEN** the script does NOT exit with code `4` and proceeds into the
  poll loop

### Requirement: Factory poll auto-closes tickets whose PR has been merged

The factory dispatcher SHALL run a new step `scripts/factory/auto-close-merged.sh`
before the per-brand dispatcher tick, for each brand. The script SHALL list
the most recent 30 merged pull requests via
`gh pr list --state merged --limit 30 --json number,title,mergedAt`, extract
the first `[T\d{6}]` token from each PR title, and for each matching ticket
that is currently in a non-terminal status (`triage`, `in_progress`,
`in_review`, `qa_review`, `blocked`, `awaiting_deploy`) call
`ticket.sh update-status --id $TICKET --status done --resolution shipped`
(or `--resolution fixed` for `type = 'bug'`). The step SHALL be idempotent:
tickets already in `done` or `archived` are skipped. The step SHALL be
fail-open: a `gh` failure or a missing ticket SHALL be logged and SHALL NOT
abort the factory tick.

#### Scenario: A merged PR with a [T000XXX] tag closes the matching in-progress ticket

- **GIVEN** a PR is in `gh pr list --state merged` with title
  `feat(scope): foo bar [T000123]`
- **AND** the ticket `T000123` is in status `in_progress`
- **WHEN** `auto-close-merged.sh BRAND=mentolder` runs
- **THEN** the script invokes
  `ticket.sh update-status --id T000123 --status done --resolution shipped`
  on the matching brand

#### Scenario: A merged PR with a bug-type ticket uses the fixed resolution

- **GIVEN** a PR is in `gh pr list --state merged` with title
  `fix(ci): blah [T000456]`
- **AND** the ticket `T000456` is `type = 'bug'` in status `awaiting_deploy`
- **WHEN** `auto-close-merged.sh BRAND=mentolder` runs
- **THEN** the script invokes
  `ticket.sh update-status --id T000456 --status done --resolution fixed`

#### Scenario: An already-done ticket is not re-closed

- **GIVEN** a PR is in `gh pr list --state merged` with title containing
  `[T000789]`
- **AND** the ticket `T000789` is already in status `done`
- **WHEN** `auto-close-merged.sh` runs
- **THEN** the script does NOT invoke `ticket.sh update-status` for
  `T000789` (idempotent — a second run is a no-op)

#### Scenario: A PR title without a [T-NNNNNN] tag is skipped

- **GIVEN** a PR with title `chore: release main` (no ticket tag)
- **WHEN** `auto-close-merged.sh` runs
- **THEN** the script does NOT invoke `ticket.sh update-status` for any
  ticket (no tag → no-op)

#### Scenario: A merged PR with an unknown ticket id is logged and skipped

- **GIVEN** a PR is in `gh pr list --state merged` with title
  `feat(scope): foo [T999999]`
- **AND** no ticket `T999999` exists in the brand's database
- **WHEN** `auto-close-merged.sh BRAND=mentolder` runs
- **THEN** the script logs a warning and does NOT abort

#### Scenario: A gh API failure does not abort the factory tick

- **GIVEN** `gh pr list --state merged` fails (e.g. network error)
- **WHEN** the factory tick calls `auto-close-merged.sh`
- **THEN** the script logs the error and exits non-zero, but the
  surrounding `wakeup.sh` loop treats it as best-effort and continues to
  the dispatcher tick

### Requirement: Factory wakeup calls auto-close-merged for both brands before the dispatcher tick

`scripts/factory/wakeup.sh` SHALL call `auto-close-merged.sh` for each brand
(`mentolder` and `korczewski`) before the dispatcher tick inside the
`while true` loop, in the same best-effort style as the existing
`auto-enqueue.sh` and `auto-triage.sh` calls. Errors from
`auto-close-merged.sh` SHALL be prefixed with `[auto-close-merged:<brand>]`
on stderr and SHALL NOT exit the loop.

#### Scenario: wakeup.sh invokes auto-close-merged for both brands per tick

- **GIVEN** a factory tick starts
- **WHEN** `wakeup.sh` runs the per-tick loop
- **THEN** for each iteration it invokes
  `BRAND=mentolder bash scripts/factory/auto-close-merged.sh` followed by
  `BRAND=korczewski bash scripts/factory/auto-close-merged.sh` before the
  dispatcher tick
- **AND** failures from either invocation are logged to stderr and do NOT
  exit the loop

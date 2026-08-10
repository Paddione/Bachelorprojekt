## ADDED Requirements

### Requirement: Claim verifies its own persistence instead of reporting an unchecked success

`scripts/agent-lock.sh claim` SHALL confirm, after writing a lock file, that the file exists
and records the calling session as its owner. When that confirmation fails, the command SHALL
exit with status 4 and emit a diagnostic on stderr. Exit status 4 SHALL be distinct from
status 1 ("held by another live session"), because the two demand opposite responses: status 1
calls for coordination with the other session, status 4 reports a broken environment in which
no lock is held at all.

`_lock_dir()` SHALL keep its `/tmp/agent-locks` fallback for genuine `git rev-parse` failures
but SHALL announce that fallback on stderr. A silent registry switch is indistinguishable from
a held lock at the call site: the claim lands in one registry while every later `check` reads
another.

#### Scenario: A claim that cannot be persisted exits non-zero and holds nothing

- **GIVEN** `AGENT_LOCK_DIR` points below a regular file, so the lock file cannot be created
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label probe` runs
- **THEN** the command exits with a non-zero status
- **AND** no lock file exists at that path afterwards
- **AND** the same claim into a writable `AGENT_LOCK_DIR` exits 0 and leaves the lock file in place

#### Scenario: The /tmp fallback is named on stderr instead of switching registries silently

- **GIVEN** the working directory is not inside a git repository, so `_lock_dir()` falls back
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label probe` runs
- **THEN** the emitted output names `/tmp/agent-locks`
- **AND** the same claim inside a git repository does not name `/tmp/agent-locks` and writes
  into that repository's `agent-locks` registry

### Requirement: One cwd-independent ownership predicate for every lock query

The system SHALL answer "does this lock belong to the calling session?" through a single
predicate used by `check`, `release`, `refresh` and `check-and-claim`. The predicate SHALL
resolve ownership by session id first, and SHALL fall back to the working-tree identity
recorded in the lock's `worktree` field. That fallback SHALL compare working trees, not the
literal string `$PWD`: a caller inside any subdirectory of the recorded worktree SHALL receive
the same verdict as a caller at its root.

The fallback SHALL remain bounded to the recorded working tree. A lock naming a different
working tree SHALL stay foreign regardless of the caller's own location.

Before this requirement, `check` and `check-and-claim` answered the question differently —
`check` by string equality of `$PWD`, `check-and-claim` by session id alone through
`cmd_claim`. That divergence is what made `check-and-claim` succeed where `check` refused, and
it forced `TICKET_LOCK_OVERRIDE=1` on ordinary status writes from a worktree subdirectory.

#### Scenario: check returns the same verdict from a worktree subdirectory as from its root

- **GIVEN** a lock `ticket__T000123.json` recorded with `worktree=<wt>` and owned by session A
- **AND** the calling session reports session id B (session-id drift)
- **WHEN** `bash scripts/agent-lock.sh check ticket T000123` runs with the working directory at `<wt>` and again at `<wt>/subdir`
- **THEN** both invocations exit with the same status 0

#### Scenario: A lock naming a foreign working tree stays held

- **GIVEN** a lock `ticket__T000124.json` recorded with `worktree=<other>` and owned by session A
- **WHEN** a caller reporting session id B runs `bash scripts/agent-lock.sh check ticket T000124` from `<wt>`, which is not `<other>`
- **THEN** the command exits with status 3

### Requirement: The ticket lock guard resolves its own session id through agent-lock

`_ticket_lock_guard` in `scripts/vda/ticket/_ticket-core.sh` SHALL obtain the calling session's
id by invoking `agent-lock.sh mine`, not by re-implementing the resolution order. Its own
lookup read only `CLAUDE_CODE_SESSION_ID` and `CLAUDE_SESSION_ID`, so under opencode the
rescue clause introduced for session-id drift could never match and the diagnostic claimed the
caller had no session while the very same tool could name it.

When the guard refuses a write, the diagnostic it emits SHALL name the caller's own session id
whenever one is resolvable.

#### Scenario: An opencode session recognises its own ticket lock

- **GIVEN** lock `ticket__T000125.json` is owned by `oc-1` and names a working tree the caller is not in
- **AND** the caller runs with `OPENCODE_SESSION_ID=oc-1` while `agent-lock.sh check` reports the lock as held
- **WHEN** `_ticket_lock_guard T000125` runs
- **THEN** it returns 0
- **AND** the same guard run with `OPENCODE_SESSION_ID=oc-fremd` returns 7

#### Scenario: A refused guard names the caller's own session id

- **GIVEN** lock `ticket__T000126.json` is owned by a foreign session
- **AND** the caller runs with `OPENCODE_SESSION_ID=oc-diag`
- **WHEN** `_ticket_lock_guard T000126` runs
- **THEN** it returns 7
- **AND** its output names both the holding session id and `oc-diag`

### Requirement: Session activity is observable before a session's first commit

The system SHALL provide `agent-lock.sh activity`, a read-only command reporting both the
current claims and the live processes whose working directory lies inside the main checkout or
any linked worktree, excluding the invoking process itself. The command SHALL exit 0
regardless of what it finds.

The `main-checkout` claim SHALL continue to be created by the pre-commit hook and SHALL NOT be
moved to session start. A `main-checkout` lock carries a non-numeric harness session id, which
`_sid_alive` treats as permanently alive, so it is only reaped after `AGENT_LOCK_TTL` — an
early claim would outlive every started-and-abandoned session by that window while
`guard-precommit` blocks other sessions' commits. Trading a false negative for a blocking
false positive is the worse exchange; the gap is closed by adding evidence, not by claiming
earlier.

Documentation of the pre-flight check (`dev-flow-chore` step 1 and the session-coordination
reference) SHALL state that an empty claim list does not prove that nobody is working.

#### Scenario: A session that has not committed yet is visible

- **GIVEN** a process is running with its working directory inside the repository and holds no claim
- **WHEN** `bash scripts/agent-lock.sh activity` runs
- **THEN** it exits 0 and its output names that process's pid
- **AND** `bash scripts/agent-lock.sh list` does not name that pid
- **AND** after the process ends, a further `activity` run no longer names it

#### Scenario: activity does not report its own invocation

- **GIVEN** no other process is working inside the repository
- **WHEN** `bash scripts/agent-lock.sh activity` runs
- **THEN** it exits 0 and does not report its own process as activity

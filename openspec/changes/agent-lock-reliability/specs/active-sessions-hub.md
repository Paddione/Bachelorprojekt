## ADDED Requirements

### Requirement: Self-owned lock contact renews the heartbeat

The system SHALL renew `heartbeat_at` of a lock whenever the owning session touches it
through a read or bookkeeping path: `agent-lock.sh check` recognizing the lock as its own
(`_lock_is_mine`), `agent-lock.sh refresh`, and the pre-commit self-claim path
(`_self_claim_main_checkout`) SHALL rewrite the lock with a fresh `heartbeat_at` while
preserving all other fields including the original `created_at`. A renewal MUST NOT change
ownership and MUST NOT be possible for a foreign live session.

Rationale: the heartbeat was previously written only at claim time. Any session working
longer than `AGENT_LOCK_TTL` without re-claiming had its lock reaped as `heartbeat-ttl`
even though it was alive — T015822.

#### Scenario: A long-running session's check renews its own heartbeat

- **GIVEN** a branch lock exists owned by the calling session with `heartbeat_at` one hour in the past
- **WHEN** the owning session runs `bash scripts/agent-lock.sh check branch <branch>`
- **THEN** the command reports the lock as held
- **AND** `heartbeat_at` in the lock file is now within the last minute
- **AND** `created_at` is unchanged

#### Scenario: A foreign live session cannot renew a heartbeat

- **GIVEN** a lock exists owned by live session A with an old `heartbeat_at`
- **WHEN** session B runs any agent-lock command except `claim --force`
- **THEN** `heartbeat_at` in the lock file is unchanged

#### Scenario: Renewal survives reap against an aged but recently touched lock

- **GIVEN** a lock owned by the calling session whose `heartbeat_at` was renewed less than `AGENT_LOCK_TTL` ago
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock file still exists
- **AND** `.reap.log` contains no entry for this lock

### Requirement: heartbeat-ttl reap of unverifiable SIDs demands a second dead signal

`_reapable()` SHALL NOT reap a lock with reason `heartbeat-ttl` solely because
`heartbeat_at` expired when the owner SID is non-numeric (harness-provided, treated as
always-alive because it cannot be pgrep-verified). Such a reap SHALL additionally require
BOTH remaining signals to be dead:

1. no active process holds a cwd inside the recorded worktree (`_worktree_has_active_process`), and
2. the worktree shows no git activity since the heartbeat — neither `HEAD`, `index`,
   nor `MERGE_HEAD` under the worktree's git dir has an mtime newer than `heartbeat_at`.

If either signal indicates life, the lock SHALL survive the sweep. Locks with numeric
owner SIDs keep the existing single-signal TTL behaviour, because their liveness is
verifiable via `pgrep -s`.

#### Scenario: Expired heartbeat but recent git activity keeps the harness lock alive

- **GIVEN** a lock with a non-numeric `owner_sid`, an existing worktree checked out on the recorded branch, `heartbeat_at` older than `AGENT_LOCK_TTL`
- **AND** the worktree's git dir shows `HEAD` mtime newer than `heartbeat_at` (a commit landed after the heartbeat)
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock file still exists
- **AND** `.reap.log` contains no `heartbeat-ttl` entry for this lock

#### Scenario: Expired heartbeat, no process, no git activity — reap proceeds

- **GIVEN** a lock with a non-numeric `owner_sid`, an existing worktree on the recorded branch, `heartbeat_at` older than `AGENT_LOCK_TTL`
- **AND** no process cwd lies inside the worktree and no git-dir file is newer than `heartbeat_at`
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock file is removed with reason `heartbeat-ttl` in `.reap.log`

#### Scenario: Numeric-SID locks keep single-signal TTL reap

- **GIVEN** a lock with a dead numeric `owner_sid` (verified not alive via `pgrep -s`), `heartbeat_at` older than `AGENT_LOCK_TTL`
- **WHEN** `bash scripts/agent-lock.sh reap` runs
- **THEN** the lock file is removed even if git activity would be present

### Requirement: Write guard denies claim-less writes into repository worktrees

`scripts/hooks/worktree-write-guard.sh` SHALL add a decision step between "own claim
allows only its worktree" and "foreign claim denies": when the target path lies inside an
existing linked worktree of this repository (per `git worktree list --porcelain`) and the
calling session holds NO claim covering that path and no foreign live claim covers it,
the hook SHALL deny the call. The denial SHALL name the target worktree and instruct the
caller to run `agent-lock.sh claim branch <branch> --worktree <path>` first. Writes to the
main checkout root and paths outside the repository stay unaffected, so ordinary main-
checkout work does not start requiring a claim. The emergency bypass
(`WORKTREE_GUARD_BYPASS=1`) SHALL override this denial.

Rationale: decision path 4 previously allowed everything for claim-less sessions — a
session could work a whole worktree invisibly to coordination (T015823).

#### Scenario: Claim-less write into a repo worktree is denied

- **GIVEN** the repository has a linked worktree at `<wt>` and the calling session holds no claim at all
- **WHEN** a file-editing tool targets `<wt>/src/foo.txt`
- **THEN** the hook denies the call
- **AND** the message names `<wt>` and the `claim branch … --worktree <path>` remedy

#### Scenario: Own valid claim still permits its worktree

- **GIVEN** the session holds a branch claim recording `worktree=<wt>`
- **WHEN** a file-editing tool targets `<wt>/src/foo.txt`
- **THEN** the hook allows the call

#### Scenario: Main-checkout writes stay exempt from the new denial

- **GIVEN** the calling session holds no claim
- **WHEN** a file-editing tool targets a path directly in the main checkout (not inside any linked worktree)
- **THEN** the hook allows the call

#### Scenario: Bypass overrides the claim-less denial

- **GIVEN** the calling session holds no claim and `WORKTREE_GUARD_BYPASS=1` is set
- **WHEN** a file-editing tool targets `<wt>/src/foo.txt`
- **THEN** the hook allows the call

### Requirement: worktree-create claims the branch automatically

`scripts/worktree-create.sh` SHALL record a branch-scoped agent-lock claim for the newly
created worktree before reporting success, with label `auto: worktree-create` and the
absolute worktree path. If the claim cannot be persisted (exit 4 semantics), the script
SHALL fail loudly instead of leaving a claim-less worktree behind. An existing live claim
on the same branch (including the caller's own) SHALL be refreshed, never duplicated or
stolen.

#### Scenario: Created worktree has a lock entry immediately

- **GIVEN** no claim exists for branch `feature/demo`
- **WHEN** `scripts/worktree-create.sh feature/demo <path>` completes successfully
- **THEN** a `branch__feature-demo.json` lock exists recording that branch and the absolute worktree path with label `auto: worktree-create`

#### Scenario: Failed claim fails the creation loudly

- **GIVEN** `AGENT_LOCK_DIR` points below a regular file so claims cannot persist
- **WHEN** `scripts/worktree-create.sh feature/demo <path>` runs
- **THEN** the script exits non-zero with a diagnostic naming the failed claim

### Requirement: activity surfaces unclaimed worktrees

`agent-lock.sh activity` SHALL append a third section listing every linked worktree of the
repository that currently hosts running processes (or recent git activity) but has no live
(non-reapable) claim referencing it. The section header SHALL be `--- unclaimed worktrees ---`.
The command remains read-only and exits 0 regardless of findings.

#### Scenario: A claim-less active worktree is listed

- **GIVEN** a process runs with its cwd inside linked worktree `<wt>` and no live claim references `<wt>`
- **WHEN** `bash scripts/agent-lock.sh activity` runs
- **THEN** the output contains the section `--- unclaimed worktrees ---` naming `<wt>`

#### Scenario: A claimed active worktree is not listed as unclaimed

- **GIVEN** a process runs with its cwd inside `<wt>` and a live claim records `worktree=<wt>`
- **WHEN** `bash scripts/agent-lock.sh activity` runs
- **THEN** the `--- unclaimed worktrees ---` section does not name `<wt>`

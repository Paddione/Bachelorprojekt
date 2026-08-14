# active-sessions-hub

## Purpose

Das Active Sessions Hub ist ein lokales Dev-Only-Feature, das laufende Dev-Sessions (HTML-Formulare, Brainstorm-Boards, Visual Companions) als klickbare Karten im Mediaviewer-Panel der Website sichtbar macht. Externe Nutzer (z.B. `gekko`) erreichen diese Sessions über Pocket-ID-gate-geschützte `sish`-Reverse-SSH-Tunnels hinter `session-*.${DEV_DOMAIN}`.

## Requirements

### Requirement: Session-Registry als Single Source of Truth

The system SHALL maintain a JSON registry at `~/.local/share/bachelorprojekt/active-sessions.json` whose entries describe one dev session each with the fields `{slug, type, title, port, public_url, local_url, tunnel_pid, server_pid, started_at}`. Mutations SHALL be atomic (write to `.tmp` then `mv`) and SHALL be performed exclusively through `scripts/session-hub.sh` subcommands.

#### Scenario: Register schreibt einen Eintrag in eine leere Registry

- **GIVEN** die Registry-Datei existiert nicht oder ist leer
- **WHEN** `bash scripts/session-hub.sh register --name foo --port 18080 --type brainstorm --title "Foo"` aufgerufen wird
- **THEN** enthält die Registry genau einen Eintrag mit `slug=foo` und `public_url=https://session-foo.${DEV_DOMAIN}`

#### Scenario: Register ist idempotent pro Slug (replace statt duplicate)

- **GIVEN** ein Eintrag mit `slug=dup` ist bereits in der Registry
- **WHEN** `register --name dup --port 2 --type form --title "v2"` ein zweites Mal aufgerufen wird
- **THEN** enthält die Registry genau einen Eintrag mit `slug=dup` und `port=2` (kein Duplikat)

#### Scenario: Reap entfernt Einträge deren PIDs nicht mehr laufen

- **GIVEN** ein Registry-Eintrag referenziert `tunnel_pid=999999` und `server_pid=999999`
- **WHEN** `bash scripts/session-hub.sh reap` aufgerufen wird
- **THEN** wird der Eintrag aus der Registry entfernt

<!-- from archive/2026-06-21-active-sessions-hub/tasks.md lines 50-244, 280-700 -->

<!-- merged from change delta active-sessions-hub.md on 2026-06-27 -->

### Requirement: Harness-Stable Session Identity for agent-lock

The system SHALL identify the owner of an `agent-lock.sh` claim by a harness-stable session id, resolved in this order: the explicit test override `AGENT_LOCK_SID` first, then the first non-empty value among the harness session-id variables (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`, `OPENCODE_SESSION_ID`), then the per-call Unix `SID(2)` only as a last-resort fallback. The override must come first: behind the harness variables it would itself be overridden by whatever the ambient session exports, which is not an override at all. Non-numeric session ids (those provided by the harness) SHALL be treated as always-alive by the reap logic and SHALL be reaped only by heartbeat TTL expiry, not by `pgrep -s`. Tool detection (`_detect_tool`) SHALL report `opencode` when `OPENCODE_SESSION_ID` is the harness variable that resolved the session id, checked before the generic Claude-harness branch so an opencode session is never misreported as `claude`.

The set of accepted harness variable names SHALL be verified against the variables the harness actually exports. A name that the harness never sets MUST NOT be the only accepted name, and the test suite MUST contain at least one case that asserts the resolution order without pre-setting the variable under test.

#### Scenario: CLAUDE_CODE_SESSION_ID wins over Unix SID

- **GIVEN** a Bash tool call is invoked from the Claude Code harness, which exports `CLAUDE_CODE_SESSION_ID=ab1744d9-01d1-4f3e` and does not export `CLAUDE_SESSION_ID`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label execute` is executed
- **THEN** the resulting lock file has `owner_sid="ab1744d9-01d1-4f3e"` (the harness env, not the per-call `ps -o sess=` value)

#### Scenario: CLAUDE_SESSION_ID remains accepted

- **GIVEN** an environment that exports `CLAUDE_SESSION_ID=claude-xyz-1234` and does not export `CLAUDE_CODE_SESSION_ID`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `owner_sid="claude-xyz-1234"`

#### Scenario: Release succeeds across separate tool calls of the same session

- **GIVEN** `bash scripts/agent-lock.sh claim ticket T000123` ran in one Bash tool call under a harness session
- **WHEN** `bash scripts/agent-lock.sh release ticket T000123` runs in a later, separate Bash tool call of the same harness session
- **THEN** the release succeeds without `--force` and the lock file is removed

#### Scenario: Test override AGENT_LOCK_SID remains authoritative

- **GIVEN** the environment sets `AGENT_LOCK_SID=test-sid-7`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `owner_sid="test-sid-7"` regardless of any harness session variable or Unix SID

#### Scenario: Harness-owned lock is not reaped by a different harness session

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=claude-xyz-1234`
- **WHEN** a different harness session (`CLAUDE_CODE_SESSION_ID=claude-abc-5678`) attempts `bash scripts/agent-lock.sh claim ticket T000123`
- **THEN** the claim is rejected with `AGENT-LOCK: ticket/T000123 bereits gehalten von …` and status 1

#### Scenario: opencode session id resolves to a stable owner_sid instead of the per-call Unix SID

- **GIVEN** only `OPENCODE_SESSION_ID` is set in the environment (no `AGENT_LOCK_SID`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`)
- **WHEN** `scripts/agent-lock.sh claim branch <name> --label test` runs
- **THEN** the written lock file's `owner_sid` equals the value of `OPENCODE_SESSION_ID`, not the process's transient Unix session id

#### Scenario: opencode session is reported as tool `opencode`, not `unknown` or `claude`

- **GIVEN** only `OPENCODE_SESSION_ID` is set in the environment
- **WHEN** `_detect_tool` (sourced from `scripts/agent-lock-identity.sh`) runs
- **THEN** it prints `opencode`

### Requirement: Pre-Commit Guards in dev-flow-plan

The system SHALL refuse to land a plan-stage commit in `dev-flow-plan` Schritt 5 unless the operator (or implementer subagent) has verified that the current branch is not `main`, that `git status --porcelain` is empty, and that the current branch matches the branch recorded in an agent-lock claim for this work. The skill text MUST contain an explicit "Pre-Commit Guard" block that surfaces these three checks as hard-coded checklist steps.

The claim satisfying the third check MAY be either ticket-scoped (`ticket__<id>.json`) or
branch-scoped (`branch__<slug>.json`). The guard MUST NOT demand the ticket-scoped file
fail-closed: for dispatched work the branch scope is the prescribed one, so a fail-closed demand for
`ticket__<id>.json` would reject exactly the claim the dispatch rulebook mandates. The skill text
SHALL reference ticket T003102 at this point so the reason is not derived again.

Every claim SHALL record a non-empty `branch` field, regardless of scope. When `--branch` is not passed, `cmd_claim` SHALL populate the field from the current `HEAD` of the claim's worktree. The branch cross-check MUST therefore be satisfiable by a claim created exactly as the skill documents it, without an extra flag the skill does not mention.

#### Scenario: Ticket-scoped claim records the branch without an explicit flag

- **GIVEN** the current worktree is checked out on `fix/t000123-foo`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label dev-flow-plan` runs without `--branch`
- **THEN** the lock file `ticket__T000123.json` records `"branch": "fix/t000123-foo"`, not the empty string

#### Scenario: A branch-scoped claim satisfies the pre-commit guard

- **GIVEN** the session holds only a branch-scoped claim `branch__<slug>.json` recording the checked-out branch
- **WHEN** the `dev-flow-plan` Schritt 5 plan-stage commit flow is followed
- **THEN** the Pre-Commit Guard accepts the claim and does not abort for a missing `ticket__<id>.json`

#### Scenario: dev-flow-plan blocks commit on main

- **GIVEN** the current branch is `main`
- **WHEN** an implementer subagent follows the `dev-flow-plan` Schritt 5 plan-stage commit flow
- **THEN** the Pre-Commit Guard block MUST instruct the subagent to refuse (`exit 1`) before any `git commit` runs

#### Scenario: dev-flow-plan requires clean working tree

- **GIVEN** `git status --porcelain` is non-empty
- **WHEN** the plan-stage commit flow is followed
- **THEN** the Pre-Commit Guard block MUST instruct the subagent to refuse (`exit 1`) with a "stash or commit first" message

#### Scenario: dev-flow-plan cross-checks branch against agent-lock claim

- **GIVEN** the agent-lock claim for `T000123` records `branch=fix/t000123-foo`
- **WHEN** the current `git rev-parse --abbrev-ref HEAD` returns `main` or some other branch
- **THEN** the Pre-Commit Guard block MUST instruct the subagent to refuse (`exit 1`) with a branch-mismatch message

### Requirement: Push-Verification Checkpoint in dev-flow-execute

The system SHALL require the implementer subagent in `dev-flow-execute` Schritt 7 to prove that the archive commit was actually pushed to `origin` before declaring the archive step complete. The proof MUST consist of: (a) `git push -u origin "$ARCHIVE_BRANCH"` exits 0, (b) `git ls-remote origin "refs/heads/$ARCHIVE_BRANCH"` returns the same SHA as the local `HEAD`, (c) the subagent return contract includes the field `push_verified:<sha>`. The skill text MUST contain an explicit "Push-Verification Checkpoint" block that documents all three checks and the return-contract field.

#### Scenario: dev-flow-execute asserts push via git ls-remote

- **GIVEN** a subagent has committed the archive steps locally on `chore/plan-archive-<slug>`
- **WHEN** the archive step is followed
- **THEN** the Push-Verification Checkpoint block MUST instruct the subagent to run `git ls-remote origin "refs/heads/$ARCHIVE_BRANCH"` and compare the SHA to the local HEAD before `gh pr create` runs

#### Scenario: dev-flow-execute mandates push_verified:<sha> in subagent return contract

- **GIVEN** the archive steps have been committed
- **WHEN** the subagent returns its completion summary to the orchestrator
- **THEN** the subagent return MUST include a `push_verified:<sha>` field (== local HEAD SHA after `git push`); the orchestrator MUST refuse to advance to merge / ticket-archive if the field is missing

### Requirement: Claim-Persistenz gegen reap-Race

The system SHALL persist `agent-lock.sh claim`-Lock-Dateien zuverlässig,
auch wenn direkt nach dem Schreiben ein Reaper-Lauf (`cmd_reap` oder
externer `reap`-Tick aus dem Factory-Dispatch) auf demselben Lock-Dir
läuft. Konkret:

- `_reapable()` in `scripts/agent-lock.sh` MUSS die
  Reapability-Prüfungen in der Reihenfolge `sid-alive → worktree-missing
  → sid-dead-Grace → heartbeat-ttl` ausführen. Ein **lebender** Owner-SID
  (laut `pgrep -s` für numerische IDs, bzw. `CLAUDE_SESSION_ID` als
  "always alive" für nicht-numerische IDs) MUSS die Lock-Datei **vor
  jedem** anderen Reapability-Check schützen — `return 1` (nicht
  reapable).
- **Der Worktree+Branch-Match (Session-Resume, Regel 0b) MUSS die
  Heartbeat-TTL respektieren:** Er schützt die Lock-Datei nur, solange
  `heartbeat_at` jünger als `AGENT_LOCK_TTL` ist (oder das Feld fehlt).
  Ist der Heartbeat abgelaufen, MUSS `_reapable()` den Lock unabhängig
  vom Worktree-Match als reapable werten (Reap-Grund `heartbeat-ttl`).
  Ein Session-Resume erneuert den Heartbeat über Re-Claim/`refresh`; ein
  toter Halter ruft nichts mehr auf und sein Lock wird nach Ablauf der
  TTL entfernt.
- `cmd_reap()` in `scripts/agent-lock.sh` MUSS vor dem iterativen
  `rm -f "$f"` über `agent-locks/*.json` dieselbe `_with_lock`-Sequenz
  aufrufen wie `cmd_claim`/`cmd_refresh`/`cmd_release`, sodass Reap und
  Claim über denselben `flock 9` auf `.registry.lock` serialisiert sind.
  Schritte 1–2c (Prozesse killen, `git worktree prune`, Branch-Cleanup)
  bleiben außerhalb des Locks, weil sie keine Lock-Dateien berühren.
- `_lock_dir()` in `scripts/agent-lock.sh` MUSS den `git-common-dir` per
  `cd "$(git rev-parse --show-toplevel)" && git rev-parse
  --git-common-dir` resolven, damit der Pfad unabhängig vom `cwd` des
  rufenden Skripts stabil ist. Der Fallback `/tmp/agent-locks` darf nur
  bei echtem `git rev-parse`-Fehler greifen.

#### Scenario: Worktree+Branch-Match schützt den Lock nur bei frischem Heartbeat

- **GIVEN** Lock `ticket__T002513.json` existiert mit `owner_sid` einer
  toten numerischen Session, toter `owner_pid`, `worktree` einem
  existierenden Git-Repo auf Branch `probe-branch`, `branch=probe-branch`
  und `heartbeat_at` älter als `AGENT_LOCK_TTL`
- **WHEN** `bash scripts/agent-lock.sh reap` läuft
- **THEN** wird die Lock-Datei entfernt
- **AND** der `.reap.log` enthält einen Eintrag
  `ticket/T002513 heartbeat-ttl`

#### Scenario: Worktree+Branch-Match mit frischem Heartbeat überlebt reap

- **GIVEN** Lock `ticket__T002513b.json` existiert mit toter `owner_sid`
  und toter `owner_pid`, passendem Worktree+Branch-Match und
  `heartbeat_at` jünger als `AGENT_LOCK_TTL`
- **WHEN** `bash scripts/agent-lock.sh reap` läuft
- **THEN** bleibt die Lock-Datei bestehen (Resume-Semantik bleibt
  erhalten — Regel 0b verliert ihre Schutzfunktion nicht)
- **AND** der `.reap.log` enthält **keinen** Eintrag für diesen Lock

#### Scenario: Altformat ohne heartbeat_at bleibt durch Regel 0b geschützt

- **GIVEN** Lock `ticket__T002513c.json` existiert ohne `heartbeat_at`-Feld,
  mit toter `owner_sid`, toter `owner_pid` und passendem
  Worktree+Branch-Match
- **WHEN** `bash scripts/agent-lock.sh reap` läuft
- **THEN** bleibt die Lock-Datei bestehen (kein Reap für prä-Heartbeat-Claims)

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/active-sessions-hub.bats`) that
establishes initial, spec-linked test coverage for the active-sessions-hub SSOT spec, per the
"one BATS file per OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/active-sessions-hub.bats` exists
- **WHEN** `bats tests/spec/active-sessions-hub.bats` is run
- **THEN** the placeholder test `active-sessions-hub spec covered` passes

<!-- merged from change delta active-sessions-hub.md (72ffc78c2fef) -->

<!-- merged from change delta active-sessions-hub.md (68c160604856) -->

### Requirement: Releasing a foreign live lock requires --force

The system SHALL permit `agent-lock.sh release` without `--force` only when the caller owns the lock (`owner_sid` equals the caller's session id) or when the recorded owner session is no longer alive. Matching tool class alone SHALL NOT authorise a release: in normal operation every participating session reports the same tool class, so such a rule would make the ownership check vacuous.

When a release is refused, the system SHALL exit with status 1 and emit a diagnostic line to stderr naming the owning session id, the caller's session id, and the `--force` escape hatch.

The same ownership rule SHALL apply to `agent-lock.sh refresh`: a session SHALL NOT extend the heartbeat of a lock held by a different live session.

#### Scenario: Release of a live foreign lock is refused

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=session-A` and `tool=claude`, and `session-A` is alive
- **WHEN** a caller with session id `session-B` and tool class `claude` runs `bash scripts/agent-lock.sh release ticket T000123`
- **THEN** the command exits with status 1
- **AND** stderr names `session-A`, `session-B` and `--force`
- **AND** the lock file still exists

#### Scenario: Release with --force succeeds against a live foreign lock

- **GIVEN** the same live foreign lock as above
- **WHEN** the caller runs `bash scripts/agent-lock.sh release ticket T000123 --force`
- **THEN** the command exits with status 0 and the lock file is removed

#### Scenario: Release of an abandoned lock succeeds without --force

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=session-A` and `session-A` is no longer alive
- **WHEN** a caller with a different session id runs `bash scripts/agent-lock.sh release ticket T000123`
- **THEN** the command exits with status 0 and the lock file is removed

#### Scenario: Own lock is released without --force across tool-call boundaries

- **GIVEN** a lock claimed by the current harness session
- **WHEN** the same session runs `bash scripts/agent-lock.sh release` from a later, separate Bash invocation
- **THEN** the command exits with status 0 without requiring `--force`

#### Scenario: Refresh of a live foreign lock is refused

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=session-A` and `tool=claude`, and `session-A` is alive
- **WHEN** a caller with session id `session-B` and tool class `claude` runs `bash scripts/agent-lock.sh refresh ticket T000123`
- **THEN** the command exits with a non-zero status and `heartbeat_at` in the lock file is unchanged

### Requirement: Lock guard tests must not depend on ambient harness environment

The system SHALL provide the test overrides `AGENT_LOCK_SID` and `AGENT_LOCK_TOOL` so that BATS coverage of the ownership guards can state its preconditions explicitly. Tests covering these guards MUST set both overrides rather than relying on which harness variables happen to be exported, so that the same verdict is produced in CI and in an interactive agent session.

#### Scenario: Guard tests produce the same verdict with and without harness environment

- **GIVEN** the BATS files covering `agent-lock.sh` release and refresh guards
- **WHEN** they are run once with `CLAUDECODE` and `CLAUDE_CODE_SESSION_ID` exported and once with both unset
- **THEN** both runs report identical pass/fail results

<!-- merged from change delta active-sessions-hub.md (ca5a66df033d) -->

### Requirement: Mandatory Worktree Scoping for File-Writing Tools

The system SHALL prevent a session that holds a branch claim with a recorded worktree from writing, through file-editing tools, to paths that lie inside the repository root but outside that worktree. The enforcement point SHALL be a `PreToolUse` hook on the file-writing tools, so that it takes effect before the write reaches disk rather than at commit time.

The hook SHALL deny the call with a message naming both the offending path and the expected worktree prefix. Paths outside the repository root SHALL be unaffected. An emergency bypass environment variable SHALL exist and SHALL be named in the denial message.

A session MAY legitimately hold several claims, and several claims MAY record the same worktree
path. The listing of permitted prefixes in the denial message SHALL name each distinct worktree
**once**, independently of how many lock files point at it.

The ownership this hook enforces is **session-scoped, not actor-scoped**: claims are matched by
owner session id, and concurrent subagents of one session share that id. The hook therefore protects
against foreign *sessions* and SHALL NOT be relied upon to keep concurrent subagents of a single
session out of one another's worktrees. Because the message is read as a statement about the calling
actor alone, the line introducing the permitted prefixes SHALL name where the ownership comes from —
that these are the claims of this session id, including those of other subagents — rather than
implying sole ownership by the caller.

#### Scenario: Write to the main checkout is denied while a worktree claim is held

- **GIVEN** the session holds a branch claim recording `worktree=/repo/.worktrees/foo`
- **WHEN** a file-editing tool is invoked on `/repo/tests/spec/mcp-gateway.bats` in the main checkout
- **THEN** the hook denies the call and the message names both the offending path and the expected prefix `/repo/.worktrees/foo`

#### Scenario: A worktree covered by two claims is listed once

- **GIVEN** the session holds both a branch-scoped and a worktree-scoped claim recording the same existing worktree path
- **WHEN** a file-editing tool is invoked on a path inside the repository but outside that worktree
- **THEN** the hook denies the call and the worktree path appears exactly once in the listing of permitted prefixes

#### Scenario: The denial names the origin of the listed ownership

- **GIVEN** the same two claims
- **WHEN** the hook denies a write outside the claimed worktree
- **THEN** the line introducing the permitted prefixes makes clear that they are the claims of this session id and may belong to other subagents of the same session

#### Scenario: Write inside the claimed worktree is allowed

- **GIVEN** the session holds a branch claim recording `worktree=/repo/.worktrees/foo`
- **WHEN** a file-editing tool is invoked on `/repo/.worktrees/foo/tests/spec/mcp-gateway.bats`
- **THEN** the hook allows the call

#### Scenario: Write to a foreign session's worktree is denied

- **GIVEN** the session holds no claim, and a live branch claim of another session records `worktree=/repo/.worktrees/bar`
- **WHEN** a file-editing tool is invoked on a path under `/repo/.worktrees/bar`
- **THEN** the hook denies the call and names the owning session id

#### Scenario: No claim and no foreign claim leaves behaviour unchanged

- **GIVEN** the session holds no branch claim with a recorded worktree, and no live foreign claim covers the target path
- **WHEN** a file-editing tool is invoked on any path
- **THEN** the hook allows the call

#### Scenario: Emergency bypass is honoured

- **GIVEN** the session holds a branch claim recording `worktree=/repo/.worktrees/foo` and the bypass variable is set
- **WHEN** a file-editing tool is invoked on `/repo/tests/spec/mcp-gateway.bats`
- **THEN** the hook allows the call

### Requirement: claim --force uebernimmt verwaiste Locks mit toter owner_pid

The system SHALL support a `--force` flag on `agent-lock.sh claim` that takes over a lock file when the `owner_pid` is no longer alive (verified via `kill -0`). A dead-PID takeover SHALL be logged to `.reap.log` with reason `claim-force`. If the `owner_pid` is still alive, `--force` SHALL refuse with a diagnostic message and exit code 1.

#### Scenario: claim --force uebernimmt Lock mit toter PID

- **GIVEN** a lock file exists with `owner_pid=999999` (a non-existent process)
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --force --label new-session` is executed from a different SID
- **THEN** the lock file is taken over with `owner_sid` set to the new session and a `claim-force` entry appears in `.reap.log`

#### Scenario: claim --force lehnt ab bei lebender PID

- **GIVEN** a lock file exists with `owner_pid=1` (an alive process)
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --force --label new-session` is executed from a different SID
- **THEN** the claim fails with exit 1 and a diagnostic message containing "claim --force abgelehnt"
- **AND** the lock file remains unchanged

### Requirement: agent-collision vermeidet False Positives bei nicht-existierenden Peer-Dateien

The collision guard SHALL skip the blob comparison for files that do not exist in a peer worktree. Only files confirmed present in both the current and the peer worktree SHALL trigger a collision warning.

#### Scenario: Brandneue Datei loest keinen Alarm aus

- **GIVEN** a new file `docs/new-feature.md` was just created and does not exist in any peer worktree
- **WHEN** the collision guard checks for conflicts
- **THEN** the guard reports no collision for this file

<!-- merged from change delta active-sessions-hub.md (9edbbdf09a31) -->

### Requirement: Deliberate Main-Checkout Reclaim for Bookkeeping Locks

`scripts/agent-lock.sh` SHALL provide a `reclaim-main-checkout` command that lets the
current session deliberately take over the `main-checkout` lock when it is currently held
only as auto-claimed bookkeeping (label `auto: pre-commit self-claim`), so that a
subsequent branch checkout in the main checkout is not reverted by
`cmd_guard_postcheckout`'s SID-mismatch protection. The command SHALL refuse to take over
a lock carrying any other (deliberate) label, leaving the existing protection for a
genuinely active foreign holder unchanged.

Rationale: `cmd_guard_precommit` already treats a bookkeeping-labelled lock as "not a real
exclusive hold" for the purposes of blocking another session's commit. Before this change,
`cmd_guard_postcheckout` had no equivalent path for the CURRENT session to act on that same
distinction — its only escape was `AGENT_LOCK_POSTCHECKOUT_REVERT=0`, a global kill-switch
that also disables the revert against a genuinely different, deliberately-claiming session.

#### Scenario: A new session reclaims a bookkeeping lock left by an earlier session

- **GIVEN** the `main-checkout` lock is held with label `auto: pre-commit self-claim` and
  an `owner_sid` different from the current session's SID
- **WHEN** the current session runs `bash scripts/agent-lock.sh reclaim-main-checkout`
- **THEN** the command exits 0
- **AND** the lock's `owner_sid` is now the current session's SID

#### Scenario: A reclaimed session's subsequent checkout is not reverted

- **GIVEN** the current session has just reclaimed the `main-checkout` lock per the
  scenario above
- **WHEN** the current session checks out a different branch and
  `cmd_guard_postcheckout` runs (e.g. via `.githooks/post-checkout`)
- **THEN** the checkout is not reverted
- **AND** `HEAD` remains on the branch the session checked out

#### Scenario: Reclaim refuses a deliberate (non-bookkeeping) foreign claim

- **GIVEN** the `main-checkout` lock is held with a label other than
  `auto: pre-commit self-claim` (a deliberate claim, e.g. `dev-flow-chore`) and an
  `owner_sid` different from the current session's SID
- **WHEN** the current session runs `bash scripts/agent-lock.sh reclaim-main-checkout`
- **THEN** the command exits 1
- **AND** the lock file is unchanged — `owner_sid` still names the original holder

#### Scenario: Reclaim is a no-op when there is nothing to take over

- **GIVEN** either no `main-checkout` lock exists, or it is already owned by the current
  session's SID
- **WHEN** the current session runs `bash scripts/agent-lock.sh reclaim-main-checkout`
- **THEN** the command exits 0
- **AND** it does not modify a lock it does not own

<!-- merged from change delta active-sessions-hub.md (473cb3f1601c) -->

<!-- merged from change delta active-sessions-hub.md (f2fab835a5a2) -->

### Requirement: Branch-scoped claims are the prescribed coordination scope for dispatched work

When work is dispatched into a worktree — by `ticket-ops` Step 3.6 or by any comparable
fan-out — the coordinating rulebooks SHALL prescribe a **branch-scoped** claim
(`agent-lock.sh claim branch <branch> --worktree <path> --branch <branch>`) and SHALL NOT
prescribe a ticket-scoped claim for that purpose.

A ticket-scoped claim held across the whole dispatch blocks the *completion* of the work rather
than a second worker: the dispatched subagent, the long-lived `ticket-mcp` server process and the
`post-merge` workflow each write under their own session identity and see the coordinator's lock as
foreign. The branch scope satisfies the write guard, still prevents two workers on one branch, and
does not create that blockade.

The dispatch template SHALL state the claim the **dispatched subagent** must set in its own
worktree, not only the claim the orchestrator sets, and SHALL name the reason (ticket T003102) so
it does not have to be derived again.

#### Scenario: The dispatch step prescribes the branch scope

- **GIVEN** the `ticket-ops` Step 3.6 dispatch section
- **WHEN** its text is read
- **THEN** it prescribes `claim branch` and contains no `claim ticket` instruction

#### Scenario: The dispatch template names the subagent's own claim and its reason

- **GIVEN** the same section
- **WHEN** its text is read
- **THEN** it contains the branch-scoped claim command intended for the dispatched subagent
- **AND** it references ticket T003102 as the reason a ticket-scoped claim is not used

### Requirement: The ticket lock guard names the regular release path before the override

When `_ticket_lock_guard` refuses a status write because a foreign claim covers the ticket, its
diagnostic SHALL name the regular resolution — releasing the claim after the work is done — and
SHALL name it **before** the `TICKET_LOCK_OVERRIDE` escape hatch.

Naming only the override presents it as the intended route. It is not: the holder is frequently the
same logical session under a different session id, and setting the override would disable the
protection against genuinely foreign sessions as well.

#### Scenario: The refusal names release ahead of the override

- **GIVEN** a lock file for a ticket whose `owner_sid` differs from the calling session's
- **WHEN** `_ticket_lock_guard` refuses the write
- **THEN** it exits non-zero and its diagnostic mentions both the release path and
  `TICKET_LOCK_OVERRIDE`
- **AND** the release path appears earlier in the output than the override

<!-- merged from change delta active-sessions-hub.md (dd0b11404cbd) -->

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

<!-- merged from change delta active-sessions-hub.md (e173512e42ee) -->

<!-- merged from change delta active-sessions-hub.md (20d01d7e00a7) -->
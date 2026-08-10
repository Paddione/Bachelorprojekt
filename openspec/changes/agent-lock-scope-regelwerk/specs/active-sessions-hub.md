## ADDED Requirements

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

## MODIFIED Requirements

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

## MODIFIED Requirements

### Requirement: Harness-Stable Session Identity for agent-lock

The system SHALL identify the owner of an `agent-lock.sh` claim by a harness-stable session id, resolved in this order: the first non-empty value among the harness session-id variables (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_SESSION_ID`), then the test override `AGENT_LOCK_SID`, then the per-call Unix `SID(2)` only as a last-resort fallback. Non-numeric session ids (those provided by the harness) SHALL be treated as always-alive by the reap logic and SHALL be reaped only by heartbeat TTL expiry, not by `pgrep -s`.

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

### Requirement: Pre-Commit Guards in dev-flow-plan

The system SHALL refuse to land a plan-stage commit in `dev-flow-plan` Schritt 5 unless the operator (or implementer subagent) has verified that the current branch is not `main`, that `git status --porcelain` is empty, and that the current branch matches the branch recorded in the agent-lock ticket claim. The skill text MUST contain an explicit "Pre-Commit Guard" block that surfaces these three checks as hard-coded checklist steps.

Every claim SHALL record a non-empty `branch` field, regardless of scope. When `--branch` is not passed, `cmd_claim` SHALL populate the field from the current `HEAD` of the claim's worktree. The branch cross-check MUST therefore be satisfiable by a claim created exactly as the skill documents it, without an extra flag the skill does not mention.

#### Scenario: Ticket-scoped claim records the branch without an explicit flag

- **GIVEN** the current worktree is checked out on `fix/t000123-foo`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label dev-flow-plan` runs without `--branch`
- **THEN** the lock file `ticket__T000123.json` records `"branch": "fix/t000123-foo"`, not the empty string

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

## ADDED Requirements

### Requirement: Mandatory Worktree Scoping for File-Writing Tools

The system SHALL prevent a session that holds a branch claim with a recorded worktree from writing, through file-editing tools, to paths that lie inside the repository root but outside that worktree. The enforcement point SHALL be a `PreToolUse` hook on the file-writing tools, so that it takes effect before the write reaches disk rather than at commit time.

The hook SHALL deny the call with a message naming both the offending path and the expected worktree prefix. Paths outside the repository root SHALL be unaffected. An emergency bypass environment variable SHALL exist and SHALL be named in the denial message.

#### Scenario: Write to the main checkout is denied while a worktree claim is held

- **GIVEN** the session holds a branch claim recording `worktree=/repo/.worktrees/foo`
- **WHEN** a file-editing tool is invoked on `/repo/tests/spec/mcp-gateway.bats` in the main checkout
- **THEN** the hook denies the call and the message names both the offending path and the expected prefix `/repo/.worktrees/foo`

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

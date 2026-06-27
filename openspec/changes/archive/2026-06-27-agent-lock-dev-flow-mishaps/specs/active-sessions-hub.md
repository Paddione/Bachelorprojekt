## ADDED Requirements

### Requirement: Harness-Stable Session Identity for agent-lock

The system SHALL identify the owner of an `agent-lock.sh` claim by a harness-stable session id — preferring `CLAUDE_SESSION_ID` (Claude Code / opencode), then the test override `AGENT_LOCK_SID`, then the per-call Unix `SID(2)` only as a last-resort fallback. Non-numeric session ids (those provided by the harness) SHALL be treated as always-alive by the reap logic and SHALL be reaped only by heartbeat TTL expiry, not by `pgrep -s`.

#### Scenario: CLAUDE_SESSION_ID wins over Unix SID

- **GIVEN** a Bash tool call is invoked from the Claude Code / opencode harness with `CLAUDE_SESSION_ID=claude-xyz-1234`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label execute` is executed
- **THEN** the resulting lock file has `owner_sid="claude-xyz-1234"` (the harness env, not the per-call `ps -o sess=` value)

#### Scenario: Test override AGENT_LOCK_SID remains authoritative

- **GIVEN** the environment sets `AGENT_LOCK_SID=test-sid-7`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `owner_sid="test-sid-7"` regardless of `CLAUDE_SESSION_ID` or Unix SID

#### Scenario: Harness-owned lock is not reaped by a different harness session

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=claude-xyz-1234`
- **WHEN** a different harness session (`CLAUDE_SESSION_ID=claude-abc-5678`) attempts `bash scripts/agent-lock.sh claim ticket T000123`
- **THEN** the claim is rejected with `AGENT-LOCK: ticket/T000123 bereits gehalten von …` and status 1

### Requirement: Pre-Commit Guards in dev-flow-plan

The system SHALL refuse to land a plan-stage commit in `dev-flow-plan` Schritt 5 unless the operator (or implementer subagent) has verified that the current branch is not `main`, that `git status --porcelain` is empty, and that the current branch matches the branch recorded in the agent-lock ticket claim. The skill text MUST contain an explicit "Pre-Commit Guard" block that surfaces these three checks as hard-coded checklist steps.

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

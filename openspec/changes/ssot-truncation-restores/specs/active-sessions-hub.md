## MODIFIED Requirements

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

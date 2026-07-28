## MODIFIED Requirements

### Requirement: Harness-Stable Session Identity for agent-lock

The system SHALL identify the owner of an `agent-lock.sh` claim by a harness-stable session id, resolved in this order: the test override `AGENT_LOCK_SID` first, then the harness session variables (`CLAUDE_CODE_SESSION_ID`, then `CLAUDE_SESSION_ID`), and only as a last resort the per-call Unix `SID(2)`. The test override MUST take precedence over the harness variables, because the harness exports them ambiently into every session — an override that ambient state can outrank is not an override.

The system SHALL resolve the tool class of the caller by the same principle: the test override `AGENT_LOCK_TOOL` first, then the ambient harness markers. Non-numeric session ids (those provided by the harness) SHALL be treated as always-alive by the reap logic and SHALL be reaped only by heartbeat TTL expiry, not by `pgrep -s`.

#### Scenario: Test override AGENT_LOCK_SID outranks the ambient harness variable

- **GIVEN** the harness has exported `CLAUDE_CODE_SESSION_ID=harness-abc` into the environment
- **AND** the caller sets `AGENT_LOCK_SID=test-sid-7`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `owner_sid="test-sid-7"`

#### Scenario: Harness session id wins over the per-call Unix SID

- **GIVEN** a Bash tool call is invoked from the harness with `CLAUDE_CODE_SESSION_ID=claude-xyz-1234` and no `AGENT_LOCK_SID`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123 --label execute` is executed
- **THEN** the resulting lock file has `owner_sid="claude-xyz-1234"` (the harness env, not the per-call `ps -o sess=` value)

#### Scenario: Test override AGENT_LOCK_TOOL outranks the ambient harness markers

- **GIVEN** the harness has exported `CLAUDECODE=1` and `CLAUDE_CODE_SESSION_ID` into the environment
- **AND** the caller sets `AGENT_LOCK_TOOL=gemini`
- **WHEN** `bash scripts/agent-lock.sh claim ticket T000123` is executed
- **THEN** the resulting lock file has `tool="gemini"`

#### Scenario: Harness-owned lock is not reaped by a different harness session

- **GIVEN** lock `ticket__T000123.json` exists with `owner_sid=claude-xyz-1234`
- **WHEN** a different harness session (`CLAUDE_CODE_SESSION_ID=claude-abc-5678`) attempts `bash scripts/agent-lock.sh claim ticket T000123`
- **THEN** the claim is rejected with `AGENT-LOCK: ticket/T000123 bereits gehalten von …` and status 1

## ADDED Requirements

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

## ADDED Requirements

### Requirement: REQ-SF-EXECUTOR-002 — opencode-Binary wird im Dienstkontext selbst aufgelöst

The system SHALL resolve the `opencode` binary inside `scripts/factory/opencode-exec.sh`
instead of assuming it is on `PATH`. The resolution SHALL consider, in order:
`$OPENCODE_BIN` (explicit override), `command -v opencode`, and the npm-global
fallback `$HOME/.npm-global/bin/opencode`. If none of these yields an existing
executable, the executor SHALL abort with a non-127 exit code and a diagnostic
message naming the missing binary and the search order — not merely propagate 127.

Rationale: the factory runs as a systemd user service whose `PATH` omits
`~/.npm-global/bin` (`systemctl --user show-environment`). `opencode-exec.sh:71`
calls `opencode run …` relying on `PATH`; interactive shells work because the
login shell prepends the dir, so the defect is invisible locally and strikes only
the unattended run — every pipeline then exits 127 with no fallback.

#### Scenario: binary found via command -v

- **GIVEN** `opencode` is resolvable via `command -v opencode`
- **WHEN** `opencode-exec.sh` prepares its run
- **THEN** it uses the resolved binary path for the `opencode run --agent orchestrator` invocation

#### Scenario: binary not on PATH but present in npm-global

- **GIVEN** `PATH` does not contain `opencode` but `$HOME/.npm-global/bin/opencode` exists and is executable
- **WHEN** `opencode-exec.sh` prepares its run
- **THEN** it uses `$HOME/.npm-global/bin/opencode` and does NOT exit with 127

#### Scenario: binary nowhere to be found

- **GIVEN** no `opencode` binary exists in `PATH`, npm-global, or `$OPENCODE_BIN`
- **WHEN** `opencode-exec.sh` prepares its run
- **THEN** it aborts with an exit code distinct from 127 and a diagnostic message that names the missing binary and the search order

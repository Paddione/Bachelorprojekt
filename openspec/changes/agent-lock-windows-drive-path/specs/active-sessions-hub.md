## ADDED Requirements

### Requirement: Platform-independent lock directory resolution

`agent-lock.sh` SHALL resolve its lock directory from the repository's git common
directory on every platform Git supports, without requiring the caller to set
`AGENT_LOCK_DIR`. A path Git reports as absolute SHALL be treated as absolute
regardless of whether it begins with a POSIX root slash or a drive letter
(`C:/…`, `C:\…`).

Only a genuinely relative path reported by Git SHALL be resolved against the
repository toplevel.

#### Scenario: Worktree on a drive-letter platform

- **GIVEN** a session working inside a linked worktree
- **AND** `git rev-parse --git-common-dir` reports `C:/repo/.git`
- **AND** `AGENT_LOCK_DIR` is not set
- **WHEN** the session runs any `agent-lock.sh` command
- **THEN** the command SHALL resolve the lock directory to `C:/repo/.git/agent-locks`
- **AND** SHALL NOT emit a path-resolution error
- **AND** SHALL remain functional, not merely silent

#### Scenario: Main checkout reporting a relative common dir

- **GIVEN** a session in the main checkout
- **AND** `git rev-parse --git-common-dir` reports `.git`
- **WHEN** the session runs any `agent-lock.sh` command
- **THEN** the command SHALL resolve the lock directory against the repository
  toplevel, unchanged from current behaviour

### Requirement: Actionable main-checkout guard diagnostics

When `worktree-create.sh` refuses to run because the source checkout is not on
`main`, its diagnostic SHALL name the supported way to proceed (`--unattended`
together with its allowlist condition) rather than reporting only the refusal.

#### Scenario: Source checkout on a feature branch

- **GIVEN** the main checkout is on a branch other than `main`
- **WHEN** a session runs `worktree-create.sh` without `--unattended`
- **THEN** the script SHALL refuse
- **AND** the message SHALL state that `--unattended` exists and under which
  condition it applies

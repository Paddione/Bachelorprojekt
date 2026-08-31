## ADDED Requirements

### Requirement: Platform-independent lock directory resolution

`agent-lock.sh` SHALL resolve its lock directory from the repository's git common
directory on every platform Git supports, without requiring the caller to set
`AGENT_LOCK_DIR`. A path Git reports as absolute SHALL be treated as absolute
regardless of whether it begins with a POSIX root slash, a drive letter
(`C:/…`, `C:\…`) or a UNC prefix.

Only a genuinely relative path reported by Git SHALL be resolved against the
repository toplevel.

This requirement records behaviour that shipped in commit `d60c3704` without a
specification; the scenarios below are the acceptance criteria it must keep meeting.

#### Scenario: Worktree on a drive-letter platform

- **GIVEN** a session working inside a linked worktree
- **AND** `git rev-parse --git-common-dir` reports `C:/repo/.git`
- **AND** `AGENT_LOCK_DIR` is not set
- **WHEN** the session runs any `agent-lock.sh` command
- **THEN** the command SHALL resolve the lock directory to `C:/repo/.git/agent-locks`
- **AND** SHALL NOT emit a path-resolution error
- **AND** SHALL run through to one of its regular outputs rather than dying in
  path resolution

#### Scenario: Main checkout reporting a relative common dir

- **GIVEN** a session in the main checkout
- **AND** `git rev-parse --git-common-dir` reports `.git`
- **WHEN** the session runs any `agent-lock.sh` command
- **THEN** the command SHALL resolve the lock directory against the repository
  toplevel

### Requirement: agent-lock logic stays within its size limit through fragments

`scripts/agent-lock.sh` SHALL stay within the S1 line limit for shell scripts.
When a change would exceed it, the surplus SHALL be moved into a sourced fragment
beside the script — the established pattern (`agent-lock-identity.sh`,
`agent-lock-guards.sh`, `agent-lock-merged.sh`, `agent-lock-activity.sh`) — rather
than absorbed by condensing lines or silenced by baselining the overrun.

Every fragment SHALL be loaded fail-loud: a missing fragment SHALL abort with a
diagnostic, never degrade silently.

#### Scenario: A change pushes the script over the limit

- **GIVEN** `scripts/agent-lock.sh` is at its S1 line limit
- **WHEN** a change adds lines to it
- **THEN** a coherent block SHALL be extracted into a new sourced fragment
- **AND** the code-quality gate SHALL report no S1 violation for the file

#### Scenario: A fragment is missing at runtime

- **GIVEN** a fragment listed in the source loop is absent
- **WHEN** `agent-lock.sh` runs
- **THEN** it SHALL abort with a message naming the missing fragment

### Requirement: Actionable main-checkout guard in worktree-create

`worktree-create.sh` SHALL refuse to run when the source checkout is not on `main`
and no explicit override was given. The refusal SHALL name the supported override
(`--unattended`, its argument position, and what it skips) rather than reporting
only the refusal, so an operator who deliberately keeps the main checkout on a
branch is not left without a way forward.

The guard SHALL apply only where a canonical `origin/main` exists; ephemeral
repositories without a remote keep the pre-existing warn path.

#### Scenario: Source checkout on a feature branch

- **GIVEN** the main checkout is on a branch other than `main`
- **AND** `origin/main` exists
- **WHEN** a session runs `worktree-create.sh` without `--unattended`
- **THEN** the script SHALL exit non-zero
- **AND** the message SHALL name `--unattended` and the condition under which it applies

#### Scenario: Override supplied

- **GIVEN** the same starting state
- **WHEN** the session passes `--unattended` as the first argument
- **THEN** the script SHALL proceed
- **AND** the git-crypt setup of the new worktree SHALL be unaffected

## ADDED Requirements

### Requirement: Harness-stable session identity for Antigravity (agy)

The system SHALL recognize `ANTIGRAVITY_CONVERSATION_ID` as a stable session identifier across `_AGENT_LOCK_SID_ENVS`, `_my_sid`, and `_detect_tool`, reporting tool class `agy`. When running under Antigravity / `agy`, file write guards and lock ownership checks SHALL NOT fall back to volatile per-call Unix SIDs.

#### Scenario: An Antigravity session resolves a stable session ID across calls
- **GIVEN** `ANTIGRAVITY_CONVERSATION_ID="agy-conv-123"` is set in the environment
- **WHEN** `_my_sid` is called from separate Bash invocations
- **THEN** it returns `agy-conv-123` on every invocation without warning of SID drift

#### Scenario: Antigravity tool is detected
- **GIVEN** `ANTIGRAVITY_CONVERSATION_ID="agy-conv-123"` and `ANTIGRAVITY_AGENT=1` are set in the environment
- **WHEN** `_detect_tool` is executed
- **THEN** it outputs `agy`

#### Scenario: Worktree write guard permits writes by the owning Antigravity session
- **GIVEN** a worktree lock claimed with `owner_sid=agy-conv-123`
- **AND** the writer process runs with `ANTIGRAVITY_CONVERSATION_ID="agy-conv-123"`
- **WHEN** `worktree-write-guard.sh` checks a write to the worktree
- **THEN** access is allowed

### Requirement: Dead locks in worktrees with idle language servers are reapable

The system SHALL exclude passive background language server and daemon processes (such as `typescript-language-server`, `tsserver`, `typingsInstaller`, `gopls`, `rust-analyzer`, `pyright`, and `vscode-*`) when checking whether a worktree has active processes via `_worktree_has_active_process`. A lock whose holder process is dead or whose heartbeat TTL has expired SHALL NOT be prevented from being reaped solely because an idle language server still has its working directory inside the worktree.

#### Scenario: Dead holder lock is reaped despite idle language server
- **GIVEN** a worktree lock whose `owner_pid` is dead and age exceeds `AGENT_LOCK_GRACE`
- **AND** an idle `typescript-language-server` process has its working directory inside the worktree
- **WHEN** `agent-lock.sh reap` runs
- **THEN** the lock is reaped with reason `pid-dead`

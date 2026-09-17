## ADDED Requirements

### Requirement: Cross-Platform Worktree Prune Protection

The system SHALL provide `scripts/lib/worktree-prune-safe.sh` implementing `worktree_prune_safe()`.
The function SHALL detect whether git is running under WSL or native Windows and verify cross-platform worktree candidate paths before invoking `git worktree prune`.
When a worktree target exists on the host filesystem under a converted path, the function SHALL protect the worktree from deletion.

`scripts/worktree-create.sh` SHALL lock newly created worktrees using `git worktree lock` to protect them from pruning by any external git commands.

#### Scenario: Worktree created by worktree-create is locked
- **GIVEN** a call to `scripts/worktree-create.sh`
- **WHEN** the worktree is successfully initialized
- **THEN** the worktree metadata contains a lock reason and survives `git worktree prune`

#### Scenario: worktree_prune_safe returns 0
- **GIVEN** an invocation of `worktree_prune_safe`
- **WHEN** execution completes on any supported platform
- **THEN** exit status is 0
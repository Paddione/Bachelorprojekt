---
name: fix-t001936-mishap-bundle
description: Fixes two mishaps: agent tool names and worktree path validation
---

# Capability: fix-t001936-mishap-bundle

## Purpose

Fix two mishaps identified in the mishap bundle:
1. Agent tool names in `bachelorprojekt-ops.md` use opencode names instead of Claude Code names
2. Worktree path validation for feature/fix branches

## ADDED Requirements

### Requirement: Agent Tool Names

The `bachelorprojekt-ops.md` agent file must use Claude Code tool names (`Bash`, `Read`, `Glob`, `Grep`) instead of opencode tool names (`run_shell_command`, `read_file`, `glob`, `grep_search`, `list_directory`).

#### Scenario: Agent spawns with correct tools

```gherkin
GIVEN a Claude Code session
WHEN spawning the bachelorprojekt-ops agent
THEN the agent should have access to Bash, Read, Glob, and Grep tools
```

### Requirement: Worktree Path Validation

The `worktree-create.sh` script must automatically redirect non-conformant paths (e.g., `tmp/`) to `.worktrees/` for feature/fix branches, preventing PR flow failures.

#### Scenario: Worktree path auto-redirect

```gherkin
GIVEN a feature branch feature/test
WHEN creating a worktree at tmp/test
THEN the script should auto-redirect to .worktrees/test
```

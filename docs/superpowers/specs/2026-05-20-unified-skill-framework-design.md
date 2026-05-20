# Design Spec: Unified Skill Framework

## Goal
Centralize repetitive skill logic (context injection, mishap tracking, environment validation, cleanup) into a manifest-driven hook system. This improves skill discoverability, robustness, and maintainability.

## Context
Currently, each skill in `.agents/skills` and `.claude/skills` duplicates boilerplate code for mishap tracking, environment checks, and context injection. This leads to "copy-paste drift" and makes it harder to update core logic across all skills.

## Proposed Changes

### 1. Skill Manifest
Extend the existing YAML frontmatter in `SKILL.md` (or add a separate `manifest.yaml`) to include a `hooks` section.

```yaml
---
name: example-skill
description: "..."
hooks:
  pre:
    - inject-plan-context
    - validate-env
  post:
    - mishap-tracker
    - cleanup-worktree
    - verify-smoke
---
```

### 2. Central Hook Registry
Create a new directory `scripts/hooks/` containing standardized bash scripts for common tasks:
- `inject-plan-context.sh`: Wraps `scripts/plan-context.sh` and prepares the prompt.
- `validate-env.sh`: Checks `ENV=` and current kubectl context.
- `mishap-tracker.sh`: Invokes the existing `mishap-tracker` tool with accumulated logs.
- `cleanup-worktree.sh`: Removes temporary files or stale worktrees.

### 3. Skill Orchestrator
A core logic (potentially integrated into `scripts/skill-helper.sh`) that:
1. Parses the skill frontmatter.
2. Executes `pre` hooks sequentially.
3. Executes the skill logic.
4. Executes `post` hooks regardless of success (using a `trap` or similar mechanism).

### 4. Integration with dev-flow
`dev-flow-plan` and `dev-flow-execute` will be the primary users of this framework, ensuring that any work started through the standard workflow automatically benefits from these centralized protections.

## Data Flow
1. **Agent Invocation**: The agent enters a skill.
2. **Pre-Hook Execution**: Orchestrator runs `pre` hooks. If one fails, execution stops with a clear error.
3. **Skill Logic**: The core task of the skill is performed.
4. **Post-Hook Execution**: Orchestrator runs `post` hooks to report mishaps and clean up.

## Verification Plan

### Automated Tests
- `task test:manifests`: Validate all `SKILL.md` files against a YAML schema.
- `tests/unit/skill-orchestrator.test.sh`: Verify that hooks are triggered in the correct order.

### Manual Verification
- Execute a skill with a forced failure in a pre-hook (e.g., wrong ENV) to verify abort logic.
- Execute a skill and verify that `mishap-tracker` is called automatically at the end.

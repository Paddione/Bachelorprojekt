---
title: "t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp — Implementation Plan"
ticket_id: T001269
domains: [skills, documentation]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp — Implementation Plan

_Ticket: T001269_

## File Structure

The following files will be created or modified:
- `.claude/skills/dev-flow-execute/SKILL.md` (modified: update status replacement patterns in sed)
- `CONTRIBUTING.md` (modified: add warnings for `git reset --hard` and add MCP tool registration best practices)
- `tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats` (created: BATS test suite for verification)
- `openspec/changes/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp/design.md` (created: design specifications)

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the newly created BATS test suite to confirm it fails on the current codebase.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats
# expected: FAIL (red — the fixes are not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Apply the fixes to `SKILL.md` and `CONTRIBUTING.md`. The BATS test from the previous step must now pass.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.bats
# expected: PASS
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

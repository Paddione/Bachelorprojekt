---
title: "mishap-t001974 — Implementation Plan"
ticket_id: T001974
domains: [devflow, git-workflow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001974 — Implementation Plan

_Ticket: T001974_

## File Structure

```
.claude/skills/using-git-worktrees/SKILL.md   # add detached-HEAD warning
.claude/skills/git-workflow/SKILL.md           # add branch-switch sequencing note
scripts/openspec-validate.ts                    # no change needed (already validates)
```

## Tasks

### Task 1: Document worktree detached-HEAD pitfall

Update `.claude/skills/using-git-worktrees/SKILL.md` to warn that
`git worktree add <path> <remote-ref>` creates a **detached HEAD**.
Add a step: always run `git checkout <branch-name>` after worktree
creation before making commits.

### Task 2: Document branch-switch + stash race condition

Update `.claude/skills/git-workflow/SKILL.md` to warn against chaining
`git checkout -b` with `git stash pop` in a single `&&` pipeline. The
stash pop can execute before the branch switch completes, causing commits
to land on the wrong branch. Use explicit sequential commands with error
checks.

### Task 3: Document OpenSpec specs/ directory requirement

Add a note to `.claude/skills/openspec-propose/SKILL.md` (or the
OpenSpec conventions in AGENTS.md) that every change folder under
`openspec/changes/<slug>/specs/` must contain at least one `.md` file
with valid delta-spec format (`## ADDED Requirements` + `### Requirement:`).
Deleting an invalid file without creating a replacement leaves the
directory empty, which also fails validation.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the OpenSpec validation test to
      confirm it currently passes on main (baseline). Then simulate the
      broken state by creating an empty specs/ dir in a test change folder.

```bash
# Simulate the broken state: create an empty specs/ dir in a test change folder
mkdir -p /tmp/openspec-test/changes/test-empty-specs/specs
npx vitest run scripts/openspec-validate.test.ts --reporter=verbose
# expected: FAIL — validateTree should fail with "specs/ has no capability .md"
```

- [ ] **Fix-Step (GREEN).** After updating the skill docs, verify no
      regressions:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

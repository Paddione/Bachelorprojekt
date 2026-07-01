---
title: "t001363-mishap-bundle — Implementation Plan"
ticket_id: T001363
domains: [skills, documentation]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001363-mishap-bundle — Implementation Plan

_Ticket: T001363_

## File Structure

The following files will be created or modified:
- `.claude/skills/dev-flow-execute/SKILL.md` (modified: Schritt 0 — expliziter Worktree-Check + Aufruf von `scripts/worktree-create.sh` falls nicht in einem Worktree)
- `tests/spec/t001363-mishap-bundle.bats` (created: Regressions-Guard für alle 3 Mishap-Einträge)

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the newly created BATS test suite to confirm the worktree-check test fails on the current SKILL.md.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001363-mishap-bundle.bats
# expected: worktree-check test FAILS (red); git-worktree-reap and git-crypt-guard tests PASS (already fixed)
```

- [ ] **Fix-Step (GREEN).** Add the explicit worktree-existence check + `scripts/worktree-create.sh` call to `.claude/skills/dev-flow-execute/SKILL.md` Schritt 0. All tests in the suite must now pass.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/t001363-mishap-bundle.bats
# expected: PASS
```

- [ ] **Final Verification.** Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

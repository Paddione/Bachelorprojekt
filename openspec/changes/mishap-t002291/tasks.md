---
title: Stale Branch Cleanup — backup/ + chore/ + subagent/ Orphans
ticket_id: T002291
domains: [repo/chore/hygiene]
status: completed
---

# mishap-t002291 — Implementation Plan

_Ticket: T002291_

## File Structure

```
openspec/changes/mishap-t002291/tasks.md   (this plan)
tests/spec/repo-stale-branches.bats         (RED test)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Write a BATS test `tests/spec/repo-stale-branches.bats` that asserts the three stale branches do NOT exist. On the current branch they still exist, so the test FAILs. Use `expected: FAIL`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-stale-branches.bats
# expected: FAIL — branches chore/mishap-T002265-v2, chore/npm-minor-patch-updates,
#            subagent-Factory-Floor---Pipeline-Fix-e2e-fixer-3d5ea810 still exist
```

- [ ] **Fix-Step 1: Delete 3 stale chore/subagent branches.** Each has no PR and no remote upstream. Force-delete with `git branch -D`.

```bash
git branch -D chore/mishap-T002265-v2 chore/npm-minor-patch-updates subagent-Factory-Floor---Pipeline-Fix-e2e-fixer-3d5ea810
# Verify:
git branch | grep -E '(mishap-T002265|npm-minor-patch|subagent-Factory-Floor)' && echo "UNEXPECTED: branch still exists" || echo "OK: branches deleted"
```

- [ ] **Fix-Step 2: Verify T002186 status and delete backup branch.** If T002186 is `done`, delete `backup/T002186-vor-rebuild-d8e581ba6`. If still open, skip.

```bash
T002186_STATUS=$(psql -tAc "SELECT status FROM tickets.tickets WHERE external_id='T002186'")
if [ "$T002186_STATUS" = "done" ]; then
  git branch -D backup/T002186-vor-rebuild-d8e581ba6
  echo "OK: backup branch deleted (T002186 is done)"
else
  echo "SKIP: T002186 is '$T002186_STATUS' — keeping backup branch"
fi
```

- [ ] **Fix-Step 1+2 re-run the RED test (GREEN now).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/repo-stale-branches.bats
# expected: PASS (green — branches no longer exist)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

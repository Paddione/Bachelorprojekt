---
title: "fix-agent-lock-canonicalize-worktree-cwd — Implementation Plan"
ticket_id: T900025
domains: [scripts, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-agent-lock-canonicalize-worktree-cwd — Implementation Plan

_Ticket: T900025_

## File Structure

```
scripts/agent-lock-activity.sh   | 188 | 612   (S1: .sh limit 800, not baselined)
tests/spec/agent-lock-liveness-heartbeat.bats   (existing, RED test T1 — no new file)
```

## Tasks

### Task 1 — Confirm the failing test (RED)

`tests/spec/agent-lock-liveness-heartbeat.bats` T1 ("live process in worktree
keeps a dead-pid matching lock from reaping") already exists on this branch
(unchanged, inherited from `origin/main`) and is red — no new test file is
needed for the core fix.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-liveness-heartbeat.bats
# expected: FAIL — "not ok 1 T1: live process in worktree keeps a dead-pid matching lock from reaping"
```

Also confirm the standalone reproducer fails the same way before the fix:

```bash
T=$(mktemp -d); mkdir -p "$T/wt"; ( cd "$T/wt" && exec sleep 15 ) & sleep 1
bash -c "source scripts/agent-lock-activity.sh >/dev/null 2>&1;
         _worktree_has_active_process '$T/wt' && echo FINDET || echo NICHTS"
# expected: FAIL — prints NICHTS (should print FINDET)
```

### Task 2 — Canonicalize `$wt` in `_worktree_has_active_process` (GREEN)

In `scripts/agent-lock-activity.sh`, at the top of `_worktree_has_active_process`
(currently starting `local wt="$1" _pid _cwd`), canonicalize `$wt` before the
`/proc/<pid>/cwd` comparison loop:

```bash
_worktree_has_active_process() {
  local wt="$1" _pid _cwd
  wt="$(cd "$wt" 2>/dev/null && pwd -P)" || return 1
  ...
```

If `$wt` does not exist or cannot be entered, the function now returns 1
(no active process found) instead of comparing against a path that will
never match anyway — this is a strict improvement, not a behavior
regression, since a non-existent worktree cannot host a live process.

Re-run Task 1's commands: the BATS test and the reproducer must both now
report the live process as active (`FINDET`, BATS test passes).

### Task 3 — Canonicalize the same comparison in `cmd_activity`

`cmd_activity` (same file) builds `_wt_roots` from `worktree_set_paths` and
compares `"$cwd" = "$wt" || "$cwd" = "$wt"/*` per root — the identical bug
class as Task 2, just in a diagnostic report ("running processes in
worktree paths") rather than the reap path. Canonicalize each `$wt` when
populating `_wt_roots` (or immediately before the comparison), mirroring
the Task 2 fix, so the diagnostic report and the liveness check share one
consistent comparison basis. No behavior change intended beyond correctly
reporting processes under non-canonical worktree path aliases.

### Task 4 — Manual smoke check of `cmd_activity`

There is no existing BATS coverage for `cmd_activity`'s process listing and
adding one is out of scope for a one-line-class fix (`cmd_activity` prints
free-form diagnostic text, not a stable machine-checked exit code/output
contract). Instead, verify manually that the fix does not break the
existing command:

```bash
bash scripts/agent-lock.sh activity
# expected: runs without error, still prints the claims list and the
# "running processes in worktree paths" section
```

### Task 5 — Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

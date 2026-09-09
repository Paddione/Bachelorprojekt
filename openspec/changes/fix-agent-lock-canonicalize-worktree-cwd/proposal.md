# Proposal: fix-agent-lock-canonicalize-worktree-cwd

## Why

`_worktree_has_active_process` in `scripts/agent-lock-activity.sh` compares
`readlink /proc/<pid>/cwd` directly against the raw `$wt` argument. On this
Windows/git-bash setup `/tmp` is an NTFS mount onto
`AppData/Local/Temp`, so a path built via `mktemp -d` (`/tmp/tmp.XXXX`) and
the same path as reported by `/proc/<pid>/cwd`
(`/c/Users/.../AppData/Local/Temp/tmp.XXXX`) are two different string
representations of the same directory. The un-canonicalized string
comparison fails, so a worktree that holds a genuinely live process is
reported as having none.

The consequence lands in `agent-lock-reap.sh`: a lock whose PID looks dead
(or whose liveness check depends on `_worktree_has_active_process`) gets
reaped even though a live process still occupies the worktree — exactly the
case `tests/spec/agent-lock-liveness-heartbeat.bats` T1 ("live process in
worktree keeps a dead-pid matching lock from reaping") is meant to prevent.
T1 is red 3/3 on `origin/main` (commit `841c98f3c`, checked
2026-09-03):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-liveness-heartbeat.bats
# -> not ok 1 T1: live process in worktree keeps a dead-pid matching lock from reaping
```

Minimal reproducer (independent of the BATS harness):

```bash
T=$(mktemp -d); mkdir -p "$T/wt"; ( cd "$T/wt" && exec sleep 15 ) & sleep 1
bash -c "source scripts/agent-lock-activity.sh >/dev/null 2>&1;
         _worktree_has_active_process '$T/wt' && echo FINDET || echo NICHTS"
# origin/main -> NICHTS   (erwartet: FINDET)
```

Canonicalizing `$wt` with `cd "$wt" && pwd -P` before the comparison
resolves the mount-point difference and makes the reproducer print
`FINDET`, matching what `/proc/<pid>/cwd` actually reports.

The same un-canonicalized comparison pattern (`"$cwd" = "$wt" || "$cwd" =
"$wt"/*`) also exists in `cmd_activity` (same file, the "running processes
in worktree paths" diagnostic block) — it just silently omits an entry from
a status report rather than causing an incorrect reap, but it is the same
bug class and is fixed alongside the reap-path occurrence.

Not caused by T900023: the extraction commit on that ticket leaves
`agent-lock-activity.sh` untouched; the file is byte-identical to
`origin/main` on that branch.

## What

- Canonicalize the `$wt` argument in `_worktree_has_active_process`
  (`scripts/agent-lock-activity.sh`) via `wt="$(cd "$wt" 2>/dev/null && pwd
  -P)" || return 1` before the `/proc/<pid>/cwd` comparison loop.
- Apply the same canonicalization to the per-worktree-root comparison in
  `cmd_activity` (same file) so the diagnostic report and the liveness
  check use one consistent comparison basis.
- No behavior change for callers: the function's inputs/outputs and exit
  codes are unchanged, only the internal comparison becomes canonical-path
  based.

_Ticket: T900025_

---
title: "worktree-create.sh: MAIN_ROOT unbound variable im Submodule-Fallback"
ticket: T001815
status: plan_staged
---

# Fix: MAIN_ROOT unbound variable in submodule fallback

## Problem

`scripts/worktree-create.sh` uses `$MAIN_ROOT` in the submodule copy fallback loop (line 157),
but `MAIN_ROOT` is not defined until line 171. When `git submodule update` fails and the fallback
runs, the script crashes under `set -u` with `MAIN_ROOT: unbound variable` and rolls back the
worktree.

## Root Cause

`MAIN_ROOT="$(dirname "$COMMON_DIR")"` is defined at line 171, inside the node_modules symlink
block (section 3). The submodule fallback (section 2, lines 154-162) references `$MAIN_ROOT` at
line 157 — before it is assigned.

## Fix

Move `MAIN_ROOT="$(dirname "$COMMON_DIR")"` to immediately before the submodule block (before
line 153). `COMMON_DIR` is already defined at line 69, so this is safe.

### Before (lines ~153-171)

```bash
# 2) Init submodules
git -C "$WT_PATH" submodule update --init --recursive --quiet || {
    echo "worktree-create: submodule update failed — ..." >&2
    for sm in tests/unit/lib/bats-core ...; do
        if [ -d "$MAIN_ROOT/$sm" ]; then   # ← MAIN_ROOT unbound here
            ...
        fi
    done
}

# 3) node_modules
MAIN_ROOT="$(dirname "$COMMON_DIR")"        # ← defined too late
```

### After

```bash
# Pre-compute MAIN_ROOT (needed by submodule fallback and node_modules symlink)
MAIN_ROOT="$(dirname "$COMMON_DIR")"

# 2) Init submodules
git -C "$WT_PATH" submodule update --init --recursive --quiet || {
    ...  # MAIN_ROOT is now in scope
}

# 3) node_modules
if [ -d "$MAIN_ROOT/node_modules" ] ...
```

## Testing

- Run `task test:changed` (or `bash scripts/worktree-create.sh` with a failing submodule) to verify the fix.
- No new BATS test needed — the fix is a one-line move.

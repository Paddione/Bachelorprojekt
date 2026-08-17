---
slug: fix-devflow-post-merge-finalize-worktree-path
ticket: T008014
status: active
---

# Fix: devflow-post-merge-finalize.sh Worktree-Pfad + cat-file Absolute-Path

## Problem

Two bugs in `scripts/devflow-post-merge-finalize.sh` cause incorrect skips during post-merge finalization:

1. **Worktree-Pfad-Ableitung (Line 123):** `WORKTREE="$REPO_DIR/.worktrees/$SLUG"` concatenates the slug without the `-T<id>` suffix. Real worktrees are named `<slug>-T<id>` (e.g., `.worktrees/sdlc-leitstand-e1-e2-T007559`). This causes steps 8+10 to incorrectly skip ("already archived/removed"), leaving cleanup undone.

2. **cat-file Absolute Path (Line 189):** `git cat-file -e "$BRANCH:$PLAN_FILE"` uses an absolutized PLAN_FILE (line 110: `PLAN_FILE="$REPO_DIR/$PLAN_FILE"`), but `git cat-file` requires a relative path (`rev:path`). The check always fails → false skip "vermutlich bereits persistiert" even though nothing was persisted.

## Tasks

### Task 1: Fix worktree path resolution (Line 118-123)

Replace slug-based concatenation with `git worktree list` suffix-match:

```bash
# Current (broken):
SLUG=""
[[ -n "$PLAN_FILE" ]] && SLUG="$(basename "$(dirname "$PLAN_FILE")" 2>/dev/null || true)"
[[ -z "$SLUG" ]] && SLUG="$(echo "$BRANCH" | sed -E 's/^(feature|fix|chore)\///; s/-T[0-9]{6,}$//')"
WORKTREE="$REPO_DIR/.worktrees/$SLUG"

# Fixed:
SLUG=""
[[ -n "$PLAN_FILE" ]] && SLUG="$(basename "$(dirname "$PLAN_FILE")" 2>/dev/null || true)"
[[ -z "$SLUG" ]] && SLUG="$(echo "$BRANCH" | sed -E 's/^(feature|fix|chore)\///; s/-T[0-9]{6,}$//')"
# Resolve worktree via git worktree list (suffix match) — worktrees have -T<id> suffix
WORKTREE=""
_wt_candidate="$REPO_DIR/.worktrees/$SLUG"
if [[ -d "$_wt_candidate" ]]; then
  WORKTREE="$_wt_candidate"
else
  # Try suffix match: <slug>-T<id>
  WORKTREE="$(git -C "$REPO_DIR" worktree list --porcelain | awk -v slug="$SLUG" '
    /^worktree / { wt=$2 }
    /^branch / && wt ~ slug "$" { print wt; found=1; exit }
    END { if (!found) exit 1 }
  ' 2>/dev/null || true)"
fi
# Fallback: original path (for backwards compat with -T<id>-less worktrees)
[[ -z "$WORKTREE" ]] && WORKTREE="$REPO_DIR/.worktrees/$SLUG"
```

### Task 2: Fix cat-file relative path (Line 189)

Strip the repo prefix from PLAN_FILE before passing to `git cat-file`:

```bash
# Current (broken):
elif [[ ! -s "$PLAN_FILE" ]] && ! git cat-file -e "$BRANCH:$PLAN_FILE" 2>/dev/null; then

# Fixed:
elif [[ ! -s "$PLAN_FILE" ]] && ! git cat-file -e "$BRANCH:${PLAN_FILE#"$REPO_DIR"/}" 2>/dev/null; then
```

### Task 3: Verify both fixes

- Test worktree resolution with a slug that has `-T<id>` suffix
- Test cat-file with an absolutized plan path
- Run `bash -n scripts/devflow-post-merge-finalize.sh` for syntax check

## Acceptance Criteria

- [ ] `WORKTREE` resolves correctly for worktrees with `-T<id>` suffix
- [ ] `git cat-file -e "$BRANCH:${PLAN_FILE#*/}"` succeeds for committed plan files
- [ ] `bash -n scripts/devflow-post-merge-finalize.sh` passes syntax check
- [ ] Existing behavior preserved for worktrees without `-T<id>` suffix (fallback)

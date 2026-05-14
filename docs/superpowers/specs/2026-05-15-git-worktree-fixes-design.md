# Git Worktree Reliability Fixes — Design

**Date:** 2026-05-15  
**Scope:** `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/dev-flow-execute/SKILL.md`

## Problem

Two independent bugs cause parallel agent sessions to produce merge conflicts and leave stale worktrees:

1. **Broken stale detection:** `dev-flow-plan` Schritt −1 uses `git branch --merged main` to find merged worktree branches. This never matches in a squash-merge workflow — squash creates a new commit without the original branch's history, so the branch is never reported as merged locally. Result: stale worktrees accumulate silently and agents pick up abandoned state.

2. **Missing sync step:** `dev-flow-execute` starts implementation directly from whatever commit the worktree was created on. If `main` has moved (common when 2–5 features land between plan and execute), the PR arrives with conflicts.

## Solution

### Fix 1 — Stale detection via `gh pr list` (dev-flow-plan Schritt −1)

Replace `git branch --merged main` with a per-worktree GitHub PR check:

```bash
git worktree list --porcelain \
  | awk '/^branch /{print $2}' \
  | grep -v 'refs/heads/main' \
  | sed 's|refs/heads/||' \
  | while read -r branch; do
    MERGED=$(gh pr list --head "$branch" --state merged --json number --jq 'length' 2>/dev/null || echo 0)
    if [[ "$MERGED" -gt 0 ]]; then
      WT=$(git worktree list --porcelain \
        | awk -v b="refs/heads/$branch" '/^worktree/{wt=$2} $0==("branch " b){print wt}')
      echo "⚠️  STALER WORKTREE: $branch → $WT (PR wurde gemergt)"
    fi
  done
```

The existing cleanup offer and non-blocking behavior stay unchanged.

### Fix 2 — Mandatory sync step (dev-flow-execute new Schritt 0.5)

Inserted after Schritt 0 (Worktree-Konsistenz) and before Schritt 1 (Plan finden):

```bash
git fetch origin main
git rebase origin/main
```

On rebase conflict: print conflicting files, abort the rebase (`git rebase --abort`), and stop with an instruction to resolve before re-running dev-flow-execute. No silent pass-through.

## Non-goals

- No worktree registry/lockfile
- No changes to cleanup logic (Schritt 7.5) — it's correct already
- No changes to subagent dispatch or CI

## Files Changed

| File | Change |
|------|--------|
| `.claude/skills/dev-flow-plan/SKILL.md` | Replace Schritt −1 detection block |
| `.claude/skills/dev-flow-execute/SKILL.md` | Insert Schritt 0.5 after Schritt 0 |

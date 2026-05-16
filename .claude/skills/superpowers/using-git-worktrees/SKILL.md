---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback
---

# Using Git Worktrees (Bachelorprojekt overrides)

> This file extends the upstream `superpowers/using-git-worktrees` skill with
> project-specific post-create requirements. Follow ALL upstream steps, then
> apply the checklist below.

## Post-Create Checklist (MANDATORY for this repo)

After `EnterWorktree` (or `git worktree add`) completes, a `PostToolUse` hook
fires automatically and handles both items. If the hook did not run (e.g. you
used the git fallback path), run these two commands manually from the worktree
root before doing any other work:

### 1. Initialize BATS submodules (T000387)

`task test:unit` fails with `bats-core/bin/bats not found` in any fresh
worktree because `git worktree add` does NOT initialize submodules.

```bash
git submodule update --init --recursive
```

This populates `tests/unit/lib/bats-core`, `bats-assert`, `bats-file`, and
`bats-support`.

### 2. Symlink `environments/.secrets` (T000383)

Worktrees start with the stub `.gitkeep` file, not the real secrets. Any task
that reads `environments/.secrets/<env>.yaml` will fail.

```bash
ln -sfn /home/patrick/Bachelorprojekt/environments/.secrets \
        environments/.secrets
```

The symlink points at the main repo's copy. The target path is absolute so it
works regardless of where the worktree is placed.

### Verification

```bash
# Submodules OK
./tests/unit/lib/bats-core/bin/bats --version

# Secrets symlink OK
ls -la environments/.secrets/mentolder.yaml
```

### 3. Fix branch name if slug-encoded (T000381)

`EnterWorktree` encodes `/` as `+` when the name contains a slash. A name like
`feature/my-task` creates branch `worktree-feature+my-task` instead of
`feature/my-task`. Check immediately after the hook fires:

```bash
git branch --show-current
# if it shows e.g. "worktree-feature+my-task", rename it:
git branch -m feature/my-task
```

The hook does NOT auto-rename (the correct target name isn't reliably
extractable from the harness response). Always verify the branch name before
your first commit.

## Automation note

The `PostToolUse` hook in `.claude/settings.json` (matcher: `EnterWorktree`)
runs both steps automatically whenever `EnterWorktree` is used. The hook:
1. Resolves the new worktree path from the tool response (falls back to
   `git worktree list --porcelain | tail -1`).
2. Runs `git submodule update --init --recursive --quiet`.
3. Replaces `environments/.secrets` with a symlink to the main repo's copy.

If you see the status message "Initializing submodules and symlinking secrets
in new worktree…" the hook fired. If it is missing, run the two commands above
manually.

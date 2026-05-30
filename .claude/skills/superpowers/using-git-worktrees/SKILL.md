---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback
---

# Using Git Worktrees (Bachelorprojekt overrides)

> This file extends the upstream `superpowers/using-git-worktrees` skill with
> project-specific post-create requirements. Follow ALL upstream steps, then
> apply the checklist below.

## Pre-Create: Main-Branch aktualisieren (Pull-First)

**Vor** dem Anlegen eines neuen Worktrees: sicherstellen, dass `origin/main` aktuell ist —
der Worktree startet sonst auf einem veralteten Stand.

```bash
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  echo "Lokale Änderungen erkannt — stashe..."
  git stash
  git pull --rebase origin main
  git stash pop
  echo "Stash zurückgespielt. Konflikte bitte prüfen."
fi
```

Falls `git stash pop` Konflikte meldet: dem User anzeigen und Klärung einholen.

---

## Post-Create Checklist (MANDATORY for this repo)

> **⚠️ Agent-specific behaviour:**
> - **Claude Code**: A `PostToolUse` hook (matcher: `Bash` / `run_shell_command`) fires
>   automatically after `EnterWorktree` or `git worktree add` and handles both steps.
> - **Gemini CLI**: The hook does **NOT** fire — Gemini CLI's shell tool is named
>   `run_command`, which does not match the hook matcher. **Always run the two
>   commands below manually** immediately after creating a worktree.

Run these two commands from the new worktree root before doing any other work:

### 1. Initialize BATS submodules (T000387 / T000107)

`task test:unit` / `task test:all` fails with `bats-core/bin/bats not found` in
any fresh worktree because `git worktree add` does NOT initialize submodules.

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

The `PostToolUse` hook in `.claude/settings.json` (matcher: `run_shell_command`)
runs both steps automatically for **Claude Code** whenever `EnterWorktree` or a
shell command that creates a worktree is used. The hook:
1. Resolves the new worktree path from the tool response (falls back to
   `git worktree list --porcelain | tail -1`).
2. Runs `git submodule update --init --recursive --quiet`.
3. Replaces `environments/.secrets` with a symlink to the main repo's copy.

If you see the status message "Initializing submodules and symlinking secrets
in new worktree…" the hook fired (Claude Code only).

**Gemini CLI** does not trigger this hook. Always run the two commands manually
(see Post-Create Checklist above). The `dev-flow-plan` SKILL.md (manual worktree
path, lines ~128–130) already includes `git submodule update --init --recursive`
in the worktree-add block — follow that pattern exactly (T000107).

## Concurrent-Session Safety (T000350)

**Never run `git checkout`, `git reset`, `git stash`, or `git rebase` in the
shared primary worktree (`/home/patrick/Bachelorprojekt`) when another session
may be active on a different branch.** These commands silently retarget HEAD and
cause PR/branch operations that omit `--head` to resolve against the wrong branch.

Rules:
- Any subagent that mutates git state (checkout, rebase, stash) **must** operate
  in an isolated `/tmp/wt-*` worktree, never the primary repo.
- Always pass `--head <branch>` explicitly on `gh pr create` and `gh pr merge`
  — never rely on the ambient current branch.

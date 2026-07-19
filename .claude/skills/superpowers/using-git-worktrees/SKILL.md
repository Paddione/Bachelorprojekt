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

## Worktree creation (MANDATORY for this repo)

Always create worktrees with the project helper — it is git-crypt-safe and runs
the post-create steps (git-crypt key/secret handling + submodule init) for you:

```bash
bash scripts/worktree-create.sh <branch> <path> [<base>]   # base defaults to origin/main
cd <path>
```

A bare `git worktree add` aborts with `smudge filter git-crypt failed` (exit 128)
since git-crypt landed (PR #1303): it runs the git-crypt smudge filter against a
key-less worktree gitdir. [T000426] The manual equivalents below are kept as
reference for any tool that bypasses the helper.

### 0. Detached-HEAD trap when passing a remote ref (T001974 Mishap 1)

`git worktree add <path> <remote-ref>` (e.g. `git worktree add .worktrees/foo
origin/feature/foo`) creates a worktree on a **detached HEAD**, not on the
branch. Any commits made there float as unreachable objects — `git push`
returns "Everything up-to-date" because the commit is on detached HEAD, not
on the branch.

**Always check out the named branch immediately after worktree creation,
before the first commit:**

```bash
git worktree add .worktrees/foo origin/feature/foo
cd .worktrees/foo
git checkout feature/foo            # detach → branch; commits now anchor here
git submodule update --init --recursive
```

The project helper `scripts/worktree-create.sh <branch> <path>` does this
correctly (it derives the branch from the name and switches into it). Use it
in preference to bare `git worktree add`.

### 1. Initialize BATS submodules (T000387 / T000107)

`task test:unit` / `task test:all` fails with `bats-core/bin/bats not found` in
any fresh worktree because `git worktree add` does NOT initialize submodules.

```bash
git submodule update --init --recursive
```

This populates `tests/unit/lib/bats-core`, `bats-assert`, `bats-file`, and
`bats-support`.

### 2. Secrets are materialized by the helper — do NOT symlink (T000426)

`scripts/worktree-create.sh` makes git-crypt work in the new worktree (it copies
the git-crypt key into the worktree gitdir when the repo is unlocked), so
`environments/.secrets/**` are present and decrypted automatically.

**Do NOT** run the old `ln -sfn .../environments/.secrets` step. Since git-crypt
landed (PR #1303) those paths are tracked encrypted blobs; symlinking over them
masks the tracked files and makes git report them deleted.

### Verification

```bash
# Submodules OK
./tests/unit/lib/bats-core/bin/bats --version

# Secrets present (decrypted when the repo is unlocked)
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

`scripts/worktree-create.sh` is the single source of truth for worktree creation:
submodule init AND git-crypt handling happen inside it, for every agent (Claude
Code, Gemini CLI, the Software Factory). There is no PostToolUse dependency — call
the helper explicitly. `dev-flow-plan` (feature + fix paths) and the Software
Factory pipeline all invoke it.

## Concurrent-Session Safety (T000350)

**Never run `git checkout`, `git reset`, `git stash`, or `git rebase` in the
shared primary worktree (`/home/patrick/Bachelorprojekt`) when another session
may be active on a different branch.** These commands silently retarget HEAD and
cause PR/branch operations that omit `--head` to resolve against the wrong branch.

Rules:
- Any subagent that mutates git state (checkout, rebase, stash) **must** operate
  in an isolated `.worktrees/*` worktree, never the primary repo.
- Always pass `--head <branch>` explicitly on `gh pr create` and `gh pr merge`
  — never rely on the ambient current branch.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | Nutzer — erstellt Worktree für Feature-Branch |
| `dev-flow-execute` | Nutzer — arbeitet im Worktree |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |


---
title: Git Worktree Reliability Fixes — Implementation Plan
domains: []
status: active
pr_number: null
---

# Git Worktree Reliability Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs that cause stale worktrees to accumulate undetected and parallel agents to produce merge conflicts.

**Architecture:** Two targeted edits to existing skill markdown files — no new files, no new scripts. Fix 1 replaces a broken bash block in `dev-flow-plan`. Fix 2 inserts a new section in `dev-flow-execute`.

**Tech Stack:** bash, `gh` CLI, `git`

**Spec:** `docs/superpowers/specs/2026-05-15-git-worktree-fixes-design.md`

---

### Task 1: Fix stale worktree detection in dev-flow-plan

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md` (lines 22–29)

The current detection uses `git branch --merged main` which never matches in a squash-merge workflow. Replace it with a per-worktree `gh pr list` check.

- [ ] **Step 1: Verify the current block is broken**

Run against the three known-stale worktrees to confirm the old code misses them:

```bash
cd /home/patrick/Bachelorprojekt
MERGED=$(git branch --merged main 2>/dev/null | grep -vE '^\*|main|HEAD' | tr -d ' ')
echo "Detected merged branches: '$MERGED'"
```

Expected output: `Detected merged branches: ''` — empty, even though three stale worktrees exist.

- [ ] **Step 2: Replace the broken detection block**

In `.claude/skills/dev-flow-plan/SKILL.md`, replace this exact block (lines 22–29):

```bash
# Bereits in main gemergte Branches mit noch aktiven Worktrees finden
MERGED=$(git branch --merged main 2>/dev/null | grep -vE '^\*|main|HEAD' | tr -d ' ')
for branch in $MERGED; do
  WT=$(git worktree list --porcelain \
    | awk -v b="refs/heads/$branch" '/^worktree/{wt=$2} $0==("branch " b){print wt}')
  [[ -n "$WT" ]] && echo "⚠️  STALER WORKTREE: $branch → $WT (bereits in main gemergt)"
done
```

With this replacement:

```bash
# Bereits in main gemergte Branches mit noch aktiven Worktrees finden
# (squash-merge-safe: prüft GitHub PR-Status statt git branch --merged)
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

- [ ] **Step 3: Verify the new detection finds the stale worktrees**

```bash
cd /home/patrick/Bachelorprojekt
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

Expected: at least one `⚠️  STALER WORKTREE` line per stale branch (`brett-camera-rework`, `brett-mannequin-focus`, `db-audit-f5-projects`).

- [ ] **Step 4: Clean up the stale worktrees that were just detected**

```bash
cd /home/patrick/Bachelorprojekt
for branch in brett-camera-rework brett-mannequin-focus db-audit-f5-projects; do
  WT=$(git worktree list --porcelain \
    | awk -v b="refs/heads/$branch" '/^worktree/{wt=$2} $0==("branch " b){print wt}')
  if [[ -n "$WT" ]]; then
    git worktree remove "$WT" --force && echo "✓ removed $WT"
    git branch -D "$branch" 2>/dev/null && echo "✓ deleted branch $branch"
    git push origin --delete "$branch" 2>/dev/null && echo "✓ deleted remote $branch" || echo "(remote already gone)"
  fi
done
```

Expected: three `✓ removed` + `✓ deleted branch` lines. Remote deletes may 404 — that's fine.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "fix(dev-flow): squash-merge-safe stale worktree detection via gh pr list"
```

---

### Task 2: Add mandatory sync step to dev-flow-execute

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (after line 38, after Schritt 0)

Insert a new Schritt 0.5 between Schritt 0 (Worktree-Konsistenz) and Schritt 1 (Plan finden) that rebases the worktree branch onto current `origin/main` before any implementation begins.

- [ ] **Step 1: Insert Schritt 0.5 after the Schritt 0 closing `---`**

In `.claude/skills/dev-flow-execute/SKILL.md`, find this exact text (line 38–41):

```
Kein Blocker — nur Warnung und Bestätigung vom User, wenn Überschneidung erkannt wird.

---

## Schritt 1: Plan finden
```

Replace it with:

```
Kein Blocker — nur Warnung und Bestätigung vom User, wenn Überschneidung erkannt wird.

---

## Schritt 0.5: Sync mit main

Bevor irgendein Agent Code schreibt, Branch auf `origin/main` rebsen — verhindert Merge-Konflikte im PR.

```bash
git fetch origin main
git rebase origin/main
```

Falls `git rebase` Konflikte meldet:

```bash
# Konfliktdateien anzeigen
git diff --name-only --diff-filter=U

# Rebase abbrechen — Agent darf NICHT mit Konflikten weitermachen
git rebase --abort
```

**STOPP.** Melde die Konflikt-Dateien an den User. Erst nach manueller Auflösung (`git rebase origin/main` erneut, dann `git rebase --continue`) weitermachen.

---

## Schritt 1: Plan finden
```

- [ ] **Step 2: Verify the edit looks correct**

```bash
grep -n "Schritt 0.5\|Schritt 1\|git fetch\|git rebase" \
  /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-execute/SKILL.md | head -15
```

Expected: `Schritt 0.5` appears before `Schritt 1`, `git fetch origin main` and `git rebase origin/main` both present.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "fix(dev-flow): add mandatory sync-from-main step before implementation"
```

---

### Task 3: Run frontmatter hook and push

- [ ] **Step 1: Run plan frontmatter hook**

```bash
cd /home/patrick/Bachelorprojekt
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/2026-05-15-git-worktree-fixes.md
```

- [ ] **Step 2: Commit plan file and push**

```bash
git add docs/superpowers/plans/2026-05-15-git-worktree-fixes.md
git commit -m "chore(plans): stage git-worktree-fixes for execution"
git push
```

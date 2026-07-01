---
title: "t001391-git-post-push-sync — Implementation Plan"
ticket_id: T001391
domains: [git-tooling, dev-workflow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001391-git-post-push-sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `scripts/git-safe-push.sh` wrapper that, after a successful push to `main`, re-fetches `origin/main` and auto-heals only a content-equivalent divergence (e.g. a squash-merge that already contains the local commit), while warning — never auto-discarding — on a genuine divergence.

**Architecture:** Git has no native post-push hook, so the check cannot live in `.githooks/pre-push` (which runs before transfer). Instead a thin wrapper runs `git push "$@"` first (its success is authoritative), then — scoped to `main` only — fetches `origin/main` and classifies the resulting relationship: in-sync (no-op), behind (fast-forward), or diverged. On divergence it compares the two-dot tree diff via `git patch-id`: an empty patch means `HEAD` introduces no content beyond `origin/main`, so with a clean working tree the local ref is safely `reset --hard` to `origin/main`; otherwise it only prints recovery guidance.

**Tech Stack:** Bash (`set -euo pipefail`), `git` plumbing (`merge-base --is-ancestor`, `patch-id --stable`, `status --porcelain`), BATS (`tests/spec/divergence-guard.bats`).

## Global Constraints

- The `.githooks/pre-push` hook and `.github/workflows/freshness-regen.yml` are context only — do NOT modify either.
- Guard is scoped to pushes where the current branch is `main`; feature/fix branches must be left completely untouched (they diverge from `origin/main` by design).
- A post-push `git fetch` network failure must never undo or fail the already-successful push — warn to stderr and exit 0.
- Auto-`reset --hard` is content-bound: it fires ONLY on confirmed patch-equivalence AND a clean working tree (`git status --porcelain` empty). A genuine divergence is warned about, never auto-discarded.
- Opt-out is a dedicated flag `SKIP_PUSH_SYNC=1` — do NOT overload the existing `SKIP_CI_CHECK`.
- No brand-domain string literals (`*.mentolder.de` / `*.korczewski.de`) anywhere in the script (S3 gate).

---

## Pre-flight — per-file line budgets (S1 ratchet)

Effective threshold = `max(static extension limit, baseline metric)`; budget = threshold − current `wc -l`. All target files are `nicht-baselined`, so the effective threshold is the static extension limit.

| File | Ist (`wc -l`) | Budget |
| --- | --- | --- |
| `scripts/git-safe-push.sh` | 0 (new) | 500 |
| `.claude/skills/git-workflow/SKILL.md` | 235 | ungated (`.md`) |
| `tests/spec/divergence-guard.bats` | 41 | ungated (`.bats`) |

- `scripts/git-safe-push.sh` is a new `.sh` file — static limit 500. Planned size is roughly 90 lines, leaving ample growth reserve; no split needed.
- The BATS tests for this ticket already exist (added during brainstorming) and run RED — Task 1 only re-verifies them, it does not add lines.

## File Structure

- **Create** `scripts/git-safe-push.sh` — post-push divergence guard wrapper around `git push`, scoped to `main`.
- **Modify** `.claude/skills/git-workflow/SKILL.md` — the main-push step references `scripts/git-safe-push.sh` instead of raw `git push` (small doc addition, no restructure).
- **Existing (no change)** `tests/spec/divergence-guard.bats` — the two `T001391` `@test` blocks already assert the wrapper's existence and behavior; they are the RED tests this plan turns GREEN.
- **Existing (no change)** `.githooks/pre-push`, `.github/workflows/freshness-regen.yml` — context only.

---

### Task 1: Confirm the RED tests

**Files:**
- Test: `tests/spec/divergence-guard.bats`

**Interfaces:**
- Consumes: nothing (starting point).
- Produces: a verified-red baseline — proof that `scripts/git-safe-push.sh` does not yet exist and both `T001391` tests fail on the current branch.

- [ ] **Step 1: Run the existing failing tests to verify they fail (RED)**

Run:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard.bats
# expected: FAIL (red — scripts/git-safe-push.sh does not exist yet)
```

Actual output observed on this branch (the two `T001391` tests fail on the missing-file assertion):

```
1..3
ok 1 worktree-create.sh has a divergence guard for local main
not ok 2 git-safe-push.sh exists and fetches origin/main after pushing to main
#   `[ -f "$script" ]' failed
not ok 3 git-safe-push.sh only auto-resets on confirmed content-equivalent divergence
#   `[ -f "$script" ]' failed
```

The tests assert three greppable properties of the future script: `git fetch origin main`, `patch-id`, `reset --hard origin/main`, and `--porcelain`. Task 2 implements exactly those.

---

### Task 2: Implement `scripts/git-safe-push.sh` (GREEN)

**Files:**
- Create: `scripts/git-safe-push.sh`
- Test: `tests/spec/divergence-guard.bats`

**Interfaces:**
- Consumes: caller passes any `git push` arguments through (`git-safe-push.sh -u origin main`, or bare for a configured upstream).
- Produces: an executable wrapper. Exit 0 on successful push (regardless of sync outcome — advisory only); the wrapper's own reconciliation never changes the push's success.

- [ ] **Step 1: Write the wrapper script**

```bash
#!/usr/bin/env bash
# scripts/git-safe-push.sh — wrapper around `git push` that reconciles a
# POST-push divergence of local `main` from origin/main. [T001391]
#
# Git has no native post-push hook (pre-push runs before transfer and cannot
# observe server-side follow-ups like the freshness-regen bot commit or a
# squash-merge). This wrapper pushes first, then — only when on `main` —
# re-fetches origin/main and heals a CONTENT-EQUIVALENT divergence, warning
# (never auto-discarding) on a genuine one.
set -euo pipefail

# Emergency opt-out — dedicated flag, does NOT overload SKIP_CI_CHECK.
if [[ "${SKIP_PUSH_SYNC:-0}" == "1" ]]; then
  exec git push "$@"
fi

# 1. Do the actual push first — its success is authoritative.
git push "$@"

# 2. Guard is scoped to `main`. On any other branch we are done.
current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [[ "$current_branch" != "main" ]]; then
  exit 0
fi

# 3. Re-fetch origin/main to observe the true post-push state. A network
#    failure here must NEVER fail the already-successful push — warn, exit 0.
if ! git fetch origin main --quiet 2>/dev/null; then
  echo "git-safe-push: WARN — could not fetch origin/main after push (network?); skipping sync check." >&2
  exit 0
fi

# 4. In sync: origin/main is an ancestor of HEAD (equal or fast-forwardable) → no-op.
if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  exit 0
fi

# 5. Behind only: HEAD is an ancestor of origin/main → fast-forward.
if git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
  echo "git-safe-push: local main is behind origin/main — fast-forwarding." >&2
  git merge --ff-only origin/main
  exit 0
fi

# 6. Genuine divergence: neither ref is an ancestor of the other.
echo "git-safe-push: local main has DIVERGED from origin/main." >&2

# 6a. Content-equivalence via patch-id of the two-dot tree diff. An empty diff
#     means HEAD's tree introduces nothing beyond origin/main (e.g. the local
#     commit was absorbed by a squash-merge upstream) → safe to discard.
diff_patch_id="$(git diff origin/main..HEAD | git patch-id --stable | awk '{print $1}')"
working_tree_clean=true
[[ -n "$(git status --porcelain)" ]] && working_tree_clean=false

if [[ -z "$diff_patch_id" && "$working_tree_clean" == true ]]; then
  discarded="$(git rev-parse --short HEAD)"
  git reset --hard origin/main
  echo "git-safe-push: content-equivalent divergence — auto-reset local main to origin/main (discarded local ref ${discarded}; its content is already upstream)." >&2
  exit 0
fi

# 6b. Genuine divergence OR dirty working tree → warn only, never auto-discard.
echo "git-safe-push: NOT auto-resetting — genuine divergence or dirty working tree." >&2
echo "  Inspect local-only commits: git log --oneline origin/main..HEAD" >&2
echo "  If you have confirmed the local content is safe to drop, recover with: git reset --hard origin/main" >&2
exit 0
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/git-safe-push.sh
```

- [ ] **Step 3: Run the BATS tests to verify they pass (GREEN)**

Run:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard.bats
```

Expected: PASS — all 3 tests green (the two `T001391` tests now find the script and match the required `git fetch origin main`, `patch-id`, `reset --hard origin/main`, and `--porcelain` tokens).

- [ ] **Step 4: Static-lint the new script**

```bash
bash -n scripts/git-safe-push.sh   # syntax check
shellcheck scripts/git-safe-push.sh || true   # advisory
```

Expected: `bash -n` exits 0 (no syntax errors).

- [ ] **Step 5: Commit**

```bash
git add scripts/git-safe-push.sh
git commit -m "fix(git-worktree): add post-push origin/main divergence guard [T001391]"
```

---

### Task 3: Reference the guard from the git-workflow skill

**Files:**
- Modify: `.claude/skills/git-workflow/SKILL.md`

**Interfaces:**
- Consumes: the executable `scripts/git-safe-push.sh` from Task 2.
- Produces: documentation pointing the main-push step at the wrapper. This is the S4 orphan-avoidance link — the new script is now reachable from a documented workflow.

- [ ] **Step 1: Add a note at the push step**

Locate the push line (`git push -u origin "$(git rev-parse --abbrev-ref HEAD)"`, around line 106) and append a note directly beneath it:

```markdown
> **Push auf `main`:** Verwende `bash scripts/git-safe-push.sh` statt rohem
> `git push`. Der Wrapper fetcht nach dem Push `origin/main` und heilt eine
> *inhalts-äquivalente* Divergenz (z. B. Squash-Merge oder freshness-regen-Bot-
> Commit) automatisch per `git reset --hard origin/main` — aber nur bei sauberem
> Working Tree; eine echte Divergenz wird nur gewarnt, nie automatisch verworfen.
> Opt-out: `SKIP_PUSH_SYNC=1`.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/git-workflow/SKILL.md
git commit -m "docs(git-workflow): reference git-safe-push.sh for main pushes [T001391]"
```

---

### Task 4: Final verification

**Files:**
- (verification only — no source changes)

**Interfaces:**
- Consumes: the completed Tasks 1–3.
- Produces: green CI-equivalent gates.

- [ ] **Step 1: Re-run the spec tests (still GREEN)**

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/divergence-guard.bats
```

Expected: PASS (3/3).

- [ ] **Step 2: Validate the OpenSpec change**

```bash
bash scripts/openspec.sh validate
```

Expected: `openspec validate: OK`.

- [ ] **Step 3: Run the three mandatory CI gates**

```bash
task test:changed          # targeted tests for changed domains (BATS selection + quality)
task freshness:regenerate  # refresh generated artifacts (test-inventory, repo-index, …)
task freshness:check       # CI equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```

Expected: all three exit 0.

- [ ] **Step 4: Commit any regenerated artifacts**

```bash
git add -A
git commit -m "chore: regenerate freshness artifacts [T001391]" || echo "nothing to regenerate"
```

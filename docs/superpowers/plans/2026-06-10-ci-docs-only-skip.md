---
title: CI Docs-Only Skip Implementation Plan
ticket_id: T000590
domains: [website, infra]
status: active
pr_number: null
---

# CI Docs-Only Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRs that only touch `docs/**` files skip the full CI suite, saving ~5 minutes of runner time per docs-only PR without blocking branch protection.

**Architecture:** Add `paths-ignore: ['docs/**']` to both the `pull_request` and `push` triggers in `.github/workflows/ci.yml`. When GitHub skips a workflow run due to `paths-ignore`, it reports all required status checks for that workflow as "skipped / passing" — branch protection is satisfied. No job-level changes needed; the trigger-level filter is sufficient.

**Tech Stack:** GitHub Actions YAML (`paths-ignore` filter on workflow triggers)

---

## Background: Why `paths-ignore` at the trigger level is safe

GitHub Actions behaviour (confirmed since late 2022): when a workflow run is **not triggered** because all changed files match `paths-ignore`, GitHub automatically marks every required status check from that workflow as **passing** for the PR. This is distinct from a workflow that runs but has individual jobs skipped via `if:` — both approaches satisfy branch protection, but trigger-level `paths-ignore` is simpler and uses zero runner minutes.

The four required checks on `main` are:
- `Offline Tests (Manifests, Configs, Unit)` — job `offline-tests`
- `Security Scan` — job `security-scan`
- `Vitest (website + arena-server)` — job `vitest`
- `Brett TypeScript` — job `brett-typescript`

All four live in `ci.yml`. Adding `paths-ignore: ['docs/**']` to both triggers means a PR changing only files under `docs/` will not trigger the workflow, and GitHub will auto-pass all four checks.

---

## File Overview

| File | Action | Change |
|------|--------|--------|
| `.github/workflows/ci.yml` | Modify | Add `paths-ignore: ['docs/**']` to `pull_request` trigger (lines 4-5) and `push` trigger (lines 6-13) |

No other files are changed.

---

## Task 1: Add `paths-ignore` to `ci.yml` triggers

**Files:**
- Modify: `.github/workflows/ci.yml` lines 3–13 (the `on:` trigger block)

### Current state of the trigger block (lines 1–13)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches:
      - main
      # release-please PRs are opened by github-actions[bot] with GITHUB_TOKEN,
      # which GitHub does not re-trigger pull_request workflows for (loop-prevention).
      # Triggering on push to the release-please branch gives branch-protection the
      # required check run so the PR can auto-merge.
      - 'release-please--branches--main'
```

### Target state (after edit)

```yaml
name: CI

on:
  pull_request:
    branches: [main]
    paths-ignore:
      - 'docs/**'
  push:
    branches:
      - main
      # release-please PRs are opened by github-actions[bot] with GITHUB_TOKEN,
      # which GitHub does not re-trigger pull_request workflows for (loop-prevention).
      # Triggering on push to the release-please branch gives branch-protection the
      # required check run so the PR can auto-merge.
      - 'release-please--branches--main'
    paths-ignore:
      - 'docs/**'
```

### Steps

- [x] **Step 1: Open `.github/workflows/ci.yml` and locate the trigger block**

  The `on:` block starts at line 3. The `pull_request` trigger is lines 4-5; the `push` trigger is lines 6-13. These are the only two places that need editing.

- [x] **Step 2: Add `paths-ignore` to the `pull_request` trigger**

  After line 5 (`    branches: [main]`), insert two lines:

  ```yaml
      paths-ignore:
        - 'docs/**'
  ```

  Result — `pull_request` block becomes:
  ```yaml
    pull_request:
      branches: [main]
      paths-ignore:
        - 'docs/**'
  ```

- [x] **Step 3: Add `paths-ignore` to the `push` trigger**

  After the last `push.branches` entry (`      - 'release-please--branches--main'`), insert two lines:

  ```yaml
      paths-ignore:
        - 'docs/**'
  ```

  Result — `push` block becomes:
  ```yaml
    push:
      branches:
        - main
        # release-please PRs are opened by github-actions[bot] with GITHUB_TOKEN,
        # which GitHub does not re-trigger pull_request workflows for (loop-prevention).
        # Triggering on push to the release-please branch gives branch-protection the
        # required check run so the PR can auto-merge.
        - 'release-please--branches--main'
      paths-ignore:
        - 'docs/**'
  ```

  > **Indentation note:** `paths-ignore` is a sibling of `branches` under `push`, so it uses 4-space indent (same level as `branches:`).

- [x] **Step 4: Validate the YAML syntax locally**

  ```bash
  python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"
  ```

  Expected output: `YAML OK`

  If you see a `ScannerError`, the indentation is wrong — re-check that `paths-ignore` under `push` uses 4 spaces (not 6).

- [x] **Step 5: Verify the full trigger block looks exactly right**

  ```bash
  head -20 .github/workflows/ci.yml
  ```

  Expected output:
  ```
  name: CI

  on:
    pull_request:
      branches: [main]
      paths-ignore:
        - 'docs/**'
    push:
      branches:
        - main
        # release-please PRs are opened by github-actions[bot] with GITHUB_TOKEN,
        # which GitHub does not re-trigger pull_request workflows for (loop-prevention).
        # Triggering on push to the release-please branch gives branch-protection the
        # required check run so the PR can auto-merge.
        - 'release-please--branches--main'
      paths-ignore:
        - 'docs/**'

  concurrency:
  ```

- [x] **Step 6: Commit**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci: skip CI for docs-only PRs via paths-ignore [T000589]"
  ```

---

## Task 2: Open PR, set auto-merge, and verify

**Files:** none (GitHub UI / CLI actions only)

- [x] **Step 1: Push the branch and open PR**

  ```bash
  git push -u origin feature/ci-docs-only-skip
  gh pr create \
    --title "ci: skip CI for docs-only PRs [T000589]" \
    --body "Adds \`paths-ignore: ['docs/**']\` to both triggers in \`ci.yml\` so PRs that only touch documentation files do not consume CI runner minutes. Required status checks are auto-passed by GitHub when a workflow is skipped via paths-ignore."
  ```

- [ ] **Step 2: Enable auto-merge on the PR**

  ```bash
  gh pr merge <PR_NUMBER> --squash --auto
  ```

  Replace `<PR_NUMBER>` with the number printed by `gh pr create`.

- [ ] **Step 3: Confirm CI runs on this PR (it MUST run — `ci.yml` itself was changed)**

  Navigate to the PR's Checks tab. Because `.github/workflows/ci.yml` is not under `docs/**`, `paths-ignore` does not suppress the CI run for this PR. All 4 jobs should run and pass.

  If CI is red, fix the issue before proceeding.

- [ ] **Step 4: After merge — verify with a docs-only PR**

  Create a test branch that only changes a file under `docs/`:

  ```bash
  git checkout -b test/docs-only-verify origin/main
  echo "<!-- test -->" >> docs/superpowers/plans/2026-06-10-ci-docs-only-skip.md
  git add docs/superpowers/plans/2026-06-10-ci-docs-only-skip.md
  git commit -m "docs: smoke-test docs-only CI skip"
  git push -u origin test/docs-only-verify
  gh pr create --title "docs: smoke-test docs-only CI skip" --body "Verifies T000589: CI should be skipped."
  ```

- [ ] **Step 5: Confirm CI is skipped on the docs-only PR**

  On the PR's Checks tab, you should see:

  - No CI workflow run listed (the workflow was not triggered at all), **OR**
  - The checks appear with a grey "skipped" badge.

  Either way, the PR should show all required checks as **green / satisfied** without any actual job running.

  > If the checks are **missing/pending** instead of green, the GitHub branch protection is treating "not triggered" differently from "skipped". In that case, switch to the per-job `if:` approach: add a `paths-filter` step at the top of each job that exits early with success when all changed files are in `docs/**`. Open a follow-up ticket for that adjustment.

- [ ] **Step 6: Close the smoke-test PR without merging**

  ```bash
  gh pr close <SMOKE_PR_NUMBER> --delete-branch
  ```

---

## Spec Coverage Self-Check

| Requirement | Covered by |
|-------------|------------|
| `paths-ignore` on `pull_request` trigger | Task 1 Step 2 |
| `paths-ignore` on `push` trigger | Task 1 Step 3 |
| YAML syntax validation | Task 1 Step 4 |
| Post-merge verification via docs-only PR | Task 2 Steps 4-5 |
| No other files changed | File Overview table |
| Branch protection edge case documented | Background section + Task 2 Step 5 fallback note |

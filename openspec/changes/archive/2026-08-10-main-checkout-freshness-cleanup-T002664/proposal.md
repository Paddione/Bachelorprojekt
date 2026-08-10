# Proposal: main-checkout-freshness-cleanup-T002664

## Why

After `git pull --ff-only` on `main`, `.githooks/post-merge` executed `task freshness:regenerate`. Untracked stray files (e.g. `tests/spec/ci-cd/freshness-paths-exist.bats`, `tests/spec/health-goals/goals-data-sdlc-target.bats`, and `unsloth_compiled_cache/`) caused `website/src/data/test-inventory.json` and `docs/code-quality/repo-index.json` to be dirty-regenerated. Since `.githooks/post-merge` did not restore these files to `HEAD`, `main` checkout was left in a dirty state, breaking subsequent `git pull --rebase` operations.

### Bug-Triage: Symptom vs Root Cause (T002448-M5)
- **Observed Symptom (Fact):** Post-merge freshness regeneration dirty-regenerates `test-inventory.json` and `repo-index.json` when untracked strays exist in main, causing git pull failures.
- **Verified Root Cause 1 (Evidenced):** `scripts/build-test-inventory.sh` uses raw `find` on `tests/local`, `tests/prod`, `tests/spec`, ignoring `.gitignore` and `git ls-files`. Any stray file under `tests/` is included into `test-inventory.json`.
- **Verified Root Cause 2 (Evidenced):** `.githooks/post-merge` runs `freshness:regenerate` but only restores `k3d/docs-content-built/`, `docs/mermaid-snapshots/`, and conditionally `loc-budget.json` to HEAD. Other generated freshness artifacts are left dirty.

## What

1. **`scripts/build-test-inventory.sh`**: Use `git ls-files` + `git ls-files --others --exclude-standard` to discover shell test files, matching `scan.mjs` (`trackedFiles()`) contract and respecting `.gitignore`.
2. **`.githooks/post-merge`**: Restore tracked freshness artifacts (`website/src/data/test-inventory.json`, `docs/code-quality/repo-index.json`) back to `HEAD` after running `freshness:regenerate` in post-merge.
3. **`tests/spec/ci-cd/test-inventory-coverage.bats`**: Add a failing test verifying that `.gitignore`-d test files are ignored by `build-test-inventory.sh`.

_Ticket: T002664_

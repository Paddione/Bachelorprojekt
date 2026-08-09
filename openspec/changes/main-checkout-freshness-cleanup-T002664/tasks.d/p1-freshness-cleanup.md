# Partial 1: Main Checkout Freshness Cleanup (T002664)

## Target Files

- `scripts/build-test-inventory.sh`
- `.githooks/post-merge`
- `tests/spec/ci-cd/test-inventory-coverage.bats`

## Tasks

- [ ] **Failing-Test-Step (RED).** Add the BATS test in `tests/spec/ci-cd/test-inventory-coverage.bats` that verifies `.gitignore`-d files are ignored by `build-test-inventory.sh`. The test must FAIL on the current branch before implementing the fix. Use the phrase `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats -f T002664 tests/spec/ci-cd/test-inventory-coverage.bats
# expected: FAIL (red — build-test-inventory.sh uses raw find and includes ignored files)
```

- [ ] **Fix-Step 1 (GREEN).** Update `scripts/build-test-inventory.sh` to use `git ls-files` + `git ls-files --others --exclude-standard` for shell test discovery, matching `scan.mjs` contract.

- [ ] **Fix-Step 2 (GREEN).** Update `.githooks/post-merge` to restore all tracked freshness artifacts (`website/src/data/test-inventory.json`, `docs/code-quality/repo-index.json`, `docs/code-quality/loc-budget.json`, etc.) to HEAD after running `freshness:regenerate`.

- [ ] **Verify Test (PASS).** Re-run the BATS test to verify it passes.

```bash
tests/unit/lib/bats-core/bin/bats -f T002664 tests/spec/ci-cd/test-inventory-coverage.bats
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

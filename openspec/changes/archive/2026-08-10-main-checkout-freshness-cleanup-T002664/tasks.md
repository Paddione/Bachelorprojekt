---
title: "main-checkout-freshness-cleanup-T002664 — Implementation Plan"
ticket_id: T002664
domains: [ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# main-checkout-freshness-cleanup-T002664 — Implementation Plan

_Ticket: T002664_

## File Structure

- `scripts/build-test-inventory.sh` — Test-Inventar-Builder: Umstellung von `find` auf `git ls-files` + `git ls-files --others --exclude-standard` (Achtung `.gitignore`)
- `.githooks/post-merge` — Post-Merge Git Hook: Wiederherstellen von `test-inventory.json` und `repo-index.json` auf `HEAD` nach `freshness:regenerate`
- `tests/spec/ci-cd/test-inventory-coverage.bats` — Regressionstest für `.gitignore`-Ignorierung in `build-test-inventory.sh`

## Partials

| id | partial | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | tasks.d/p1-freshness-cleanup.md | tests | scripts/build-test-inventory.sh, .githooks/post-merge, tests/spec/ci-cd/test-inventory-coverage.bats | |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test in `tests/spec/ci-cd/test-inventory-coverage.bats`. The test must FAIL on the current branch. Use the phrase `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats -f T002664 tests/spec/ci-cd/test-inventory-coverage.bats
# expected: FAIL (red — raw find includes ignored files)
```

- [ ] **Fix-Step (GREEN).** Implement the fix in `scripts/build-test-inventory.sh` and `.githooks/post-merge`.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

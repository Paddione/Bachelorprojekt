---
title: "ci-freshness-guard-read-pr-body — Implementation Plan"
ticket_id: T015384
domains: [ci-cd]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ci-freshness-guard-read-pr-body — Implementation Plan

_Ticket: T015384_

## Partials Manifest
- `p1-fix`: Implements the PR body fallback and hard fail, with tests.

## File Structure

```
tests/spec/ci-cd/baseline-guard-read-pr-body.bats
scripts/code-quality/baseline-key-count-assertion.mjs
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS test that reproduces the bug. The test must FAIL on the current branch. `expected: FAIL`

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/baseline-guard-read-pr-body.bats
# expected: FAIL
```

- [x] **Fix-Step (GREEN).** Implement the fix in `scripts/code-quality/baseline-key-count-assertion.mjs`.

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

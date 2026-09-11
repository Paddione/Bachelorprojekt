---
title: "require-review-before-automerge — Implementation Plan"
ticket_id: T900089
domains: [ci, github, security]
status: active
file_locks:
  - scripts/gh-branch-protection.sh
  - scripts/check-branch-protection.sh
  - tests/spec/ci-cd/main-direct-push-guard.bats
  - openspec/specs/ci-cd.md
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# require-review-before-automerge — Implementation Plan

_Ticket: T900089_

## File Structure

```
scripts/gh-branch-protection.sh              # idempotent GitHub protection payload
scripts/check-branch-protection.sh           # local/live compliance assertion
tests/spec/ci-cd/main-direct-push-guard.bats # regression fixture for required approvals
openspec/specs/ci-cd.md                      # merged SSOT requirement (via archive)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Extend
      `tests/spec/ci-cd/main-direct-push-guard.bats` with a fixture whose
      `required_approving_review_count` is `0`; assert that
      `scripts/check-branch-protection.sh --from-json` rejects it. Run:

```bash
bash tests/bats tests/spec/ci-cd/main-direct-push-guard.bats
# expected: FAIL (red — the checker currently accepts a zero-review policy)
```

- [ ] **Fix-Step (GREEN).** Update `scripts/check-branch-protection.sh` to
      require `required_pull_request_reviews.required_approving_review_count`
      to be at least `1`. Update `scripts/gh-branch-protection.sh` so its
      full PUT payload preserves existing review options but initializes or
      raises that count to `1`; do not alter auto-merge, dependency exceptions,
      or required-status-check policy. Run the same BATS file until green.

- [ ] **Spec-Step.** Archive the validated OpenSpec delta into
      `openspec/specs/ci-cd.md` after the implementation PR merges; the
      requirement must state that auto-merge waits for at least one approval.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

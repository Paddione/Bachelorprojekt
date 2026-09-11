---
title: "enforce-admins-branch-protection — Implementation Plan"
ticket_id: T900126
domains: [ci, github, security]
status: active
file_locks:
  - scripts/gh-branch-protection.sh
  - tests/spec/ci-cd/main-direct-push-guard.bats
  - openspec/specs/ci-cd.md
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# enforce-admins-branch-protection — Implementation Plan

_Ticket: T900126_

## File Structure

```
scripts/gh-branch-protection.sh              # administrator enforcement in the API payload
tests/spec/ci-cd/main-direct-push-guard.bats # regression assertion for the payload contract
openspec/specs/ci-cd.md                      # merged SSOT requirement
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS assertion that the protection payload hard-codes
      `ENFORCE_ADMINS=true`. The test fails on the current branch because the apply script
      currently copies `.enforce_admins.enabled` from the live API. The step includes the exact
      phrase `expected: FAIL` for plan-lint STRUCT2.

```bash
# Run the focused regression file before implementing the fix.
bash tests/bats tests/spec/ci-cd/main-direct-push-guard.bats
# expected: FAIL (red — the apply script still preserves enforce_admins=false)
```

- [x] **Fix-Step (GREEN).** Set `ENFORCE_ADMINS=true` in the protection payload builder without
      changing required checks, review count, restrictions, or auto-merge behavior. The focused
      BATS file must pass.

- [ ] **Live-Step.** Apply the merged policy with an admin-scoped GitHub token using
      `task gh:branch-protection:apply` and verify `task test:branch-protection` exits zero.

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

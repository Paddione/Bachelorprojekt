---
title: "ci-fast-path-optimizations — Implementation Plan"
ticket_id: T013468
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ci-fast-path-optimizations — Implementation Plan

_Ticket: T013468_

## File Structure

```
.github/workflows/ci.yml
openspec/specs/ci-cd.md
tests/spec/ci-cd/website-fast-path.bats
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add BATS test validating step-level website path filter and actionlint caching in `.github/workflows/ci.yml`.
      The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/website-fast-path.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [x] **Task 1: Add Fast-Path check to `Vitest (website)` in `.github/workflows/ci.yml`.**
      Add a diff filter step against `origin/main` right after checkout. Guard subsequent pnpm install, lint, vitest/astro/knip parallel steps, and coverage gate with `if: steps.filter.outputs.run_website == 'true'`.

- [x] **Task 2: Add actions/cache or optimization for actionlint in `BATS Unit + Quality Gates`.**
      Cache actionlint binary to avoid repeated curl downloads across workflow runs.

- [x] **Fix-Step (GREEN).** Verify BATS spec tests pass.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/website-fast-path.bats
```

- [ ] **Final Verification.** Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```



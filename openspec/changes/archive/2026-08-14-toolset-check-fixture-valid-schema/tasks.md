---
title: "toolset-check-fixture-valid-schema — Implementation Plan"
ticket_id: T004889
domains: [scripts, ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# toolset-check-fixture-valid-schema — Implementation Plan

_Ticket: T004889_

## File Structure

```
scripts/toolset/check.test.mjs  # Fixture and schema validation test updates
```

## 1. Test-Fixture & Schema Validation (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Run the existing test runner with `node --test` which currently fails due to invalid fixture schema without `use_when` and `roles`.
      The test MUST fail on the unfixed codebase.

```bash
node --test scripts/toolset/check.test.mjs
# expected: FAIL (red — Fixture lacks use_when and roles required by check.mjs validator)
```

- [x] **Fix-Step (GREEN).** Update `scripts/toolset/check.test.mjs`:
      1. Add `use_when: "Manage GitHub PRs and issues via CLI"` and `roles: [all]` to the `cli:gh-axi` fixture.
      2. Add a subtest verifying that missing `use_when` or empty `roles` on a canonical instance causes `check.mjs` to exit with non-zero status.

```bash
node --test scripts/toolset/check.test.mjs
# expected: PASS (green — valid fixture passes and invalid fixture is rejected)
```

- [x] **Final Verification.** Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```




---
title: "t001586 — Implementation Plan"
ticket_id: T001586
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001586 — Implementation Plan

_Ticket: T001586_

## File Structure

```
.mcp.json (port-correction: 127.0.0.1:13004 → localhost:13003)
tests/spec/mcp-tooling.bats (new BATS test for factory-mcp port guard)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-tooling.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [x] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

  - Port correction in `.mcp.json`: `127.0.0.1:13004` → `localhost:13003`
  - Add BATS test for factory-mcp port guard in `tests/spec/mcp-tooling.bats`

- [x] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

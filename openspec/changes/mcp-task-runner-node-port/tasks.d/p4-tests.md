# Partial 4: Test Suite & Verification

## Tasks

- [ ] **Step 1: Failing Test (RED)**
  - Execute existing BATS test suite against the target Node.js server path before full implementation.
  - Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-task-runner.bats`
  - Expected: `expected: FAIL` (Node server not yet present at target script path).

- [ ] **Step 2: Integration Verification (GREEN)**
  - Run all BATS tests for `mcp-task-runner`.
  - Run: `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-task-runner.bats tests/spec/mcp-task-runner/spec-doc-covers-7-tools.bats tests/spec/mcp-task-runner/planner-sees-real-deps.bats`
  - Expected: All tests PASS.

- [ ] **Step 3: Quality Gates & Freshness Check**
  - Run: `task freshness:regenerate`
  - Run: `task freshness:check`
  - Run: `task test:changed`

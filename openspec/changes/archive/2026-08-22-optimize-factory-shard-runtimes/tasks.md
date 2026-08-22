---
title: "optimize-factory-shard-runtimes — Implementation Plan"
ticket_id: T013528
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# optimize-factory-shard-runtimes — Implementation Plan

_Ticket: T013528_

## File Structure

```
.github/workflows/ci.yml
tests/spec/.spec-runtime.tsv
tests/spec/ci-cd/factory-shard-optimization.bats
```

## Tasks

- [ ] **1. Workflow Optimierung (.github/workflows/ci.yml)**
  - Move `task ticket-mcp:test` into `test-factory-openspec`
  - Remove `task ticket-mcp:test` from `test-factory-shard`
- [ ] **2. Guard & Regression Test**
  - Add `tests/spec/ci-cd/factory-shard-optimization.bats` verifying that `test-factory-shard` does not contain redundant Go test steps and `test-factory-openspec` runs them
- [ ] **3. Re-Weighting Spec Suite**
  - Update `tests/spec/.spec-runtime.tsv` to cover newly added spec files
  - Verify balance via `scripts/spec-shard.sh --verify --of 4`

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the guard test verifying workflow structure.
  The test must FAIL before editing ci.yml.
  expected: FAIL

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/factory-shard-optimization.bats
# expected: FAIL (red — workflow not yet updated)
```

- [ ] **Fix-Step (GREEN).** Update .github/workflows/ci.yml and .spec-runtime.tsv.
  The test must now PASS.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/factory-shard-optimization.bats
find tests/spec -name '*.bats' -type f | bash scripts/spec-shard.sh --verify --of 4
```

- [ ] **Final Verification.** Run mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```


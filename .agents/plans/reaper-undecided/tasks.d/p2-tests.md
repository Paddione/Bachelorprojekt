# p2 — Tests

Target files: `tests/spec/ci-cd/branch-reaper-undecided.bats`.

### Task 1: Tests gruen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-undecided.bats tests/spec/ci-cd/ tests/spec/branch-reaper-netzausfall.bats tests/spec/batch-repo-hygiene-ops-fixes/reaper-worktree-checkout-keep.bats
```

Vor p1 expected: FAIL fuer Tests 2 und 3, danach alle gruen.

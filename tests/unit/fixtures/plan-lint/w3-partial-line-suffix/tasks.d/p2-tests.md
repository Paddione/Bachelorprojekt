# Partial 2: Tests

## Task 1: Run regression test — expect FAIL initially

**Files:** `tests/unit/plan-lint.bats`

- Run the W3 partial test to verify it catches the bug
- Expected: exit 1 (test fails because W3 still fires incorrectly)

```bash
bash tests/unit/lib/bats-core/bin/bats tests/unit/plan-lint.bats --filter "W3 partial"
# Expected: FAIL (the test should fail initially, proving the bug exists)
```

## Task 2: Verify fixture structure

**Files:** `tests/unit/fixtures/plan-lint/w3-partial-line-suffix/tasks.md`

- Verify the fixture file exists and has correct structure
- Expected: file exists, contains line-suffix reference

```bash
test -f tests/unit/fixtures/plan-lint/w3-partial-line-suffix/tasks.md
grep -q "scripts/register-scope.sh:6-31" tests/unit/fixtures/plan-lint/w3-partial-line-suffix/tasks.d/p1-impl.md
# Expected: PASS (fixture exists and has correct reference)
```

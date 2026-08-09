# Partial Task p2: BATS Regression Test for E2E Spec Assertions

## Target Files
- `tests/spec/e2e-testing.bats`

## Tasks

### Task 1: Verify RED failing BATS test for T002730
- **File**: `tests/spec/e2e-testing.bats`
- **Action**: Add automated test cases for T002730 verifying that `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts` asserts positive status `403` and does not contain `not.toBe`.
- **Failing Test Step**: Run `npx bats tests/spec/e2e-testing.bats` (expected: FAIL before implementation fix).

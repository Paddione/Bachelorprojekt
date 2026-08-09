# Partial Task p1: Fix E2E Spec Positive Assertions

## Target Files
- `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts`

## Tasks

### Task 1: Update E2E spec assertions to explicit positive status 403
- **File**: `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts`
- **Action**:
  - Update file header comment on line 6 to list `403` as the expected unauthenticated response code.
  - Update `expect(response.status()).not.toBe(404);` on line 18 to `expect(response.status()).toBe(403);`.
  - Update `expect(response.status()).not.toBe(404);` on line 25 to `expect(response.status()).toBe(403);`.
- **Verification**: `npx playwright test tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts --list` or static inspection.

# Proposal: fa-59-e2e-spec-positive-assertion

## Why

In `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts`, the E2E test assertions currently check:
```ts
expect(response.status()).not.toBe(404);
```
This violates the positive-anchor requirement in `CLAUDE.md` [T002356-M1]. Any non-404 status (such as 500 internal server error, 502 bad gateway, or 503 service unavailable) passes the test, masking server failures.

### Triage: Observed Symptom vs. Verified Root Cause [T002448-M5]
- **Observed Symptom**: The E2E tests pass even if the endpoint fails with 5xx status codes, as long as the status is not 404.
- **Verified Root Cause**: Unauthenticated requests to `/sdlc/api/systemtest/purge-all-test-data` and `/sdlc/api/systemtest/cleanup-fixtures` return status code `403 (Forbidden)` as implemented in `website/src/pages/sdlc/api/systemtest/purge-all-test-data.ts:26` and `cleanup-fixtures.ts:21`. The file comment listed `401/405/200` but didn't mention `403`. The assertions used `.not.toBe(404)` instead of testing for the expected status `403`.

## What

1. Update `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts` assertions from `expect(response.status()).not.toBe(404)` to `expect(response.status()).toBe(403)` for both `purge-all-test-data` and `cleanup-fixtures`.
2. Update the file header comment in `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts` to document `403` (Forbidden) as the expected unauthenticated response code.
3. Add a regression spec check in `tests/spec/e2e-testing.bats` ensuring that `fa-59-systemtest-purge-endpoint.spec.ts` uses explicit `403` positive assertions and no longer uses `not.toBe(404)`.

_Ticket: T002730_

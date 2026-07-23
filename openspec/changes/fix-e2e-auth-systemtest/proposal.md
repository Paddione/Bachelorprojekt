# Proposal: Fix E2E Test Failures

## Summary
Address the root causes of the failing Playwright E2E tests:
1. `loginViaE2E` and `wissensquellen-fixtures.ts` navigation timeouts during admin auth.
2. System-test runner issuing unauthenticated `page.request.get` calls resulting in HTTP 401.
3. Nextcloud Talk iOS WebKit spec element visibility selector timeout.

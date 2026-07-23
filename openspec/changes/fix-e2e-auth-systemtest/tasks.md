---
title: Fix E2E Auth, System-Test 401s, and Talk Selector
ticket_id: T002075
domains: [website, test]
status: staged
---

# fix-e2e-auth-systemtest — Implementation Plan

## File Structure
- `tests/e2e/lib/auth.ts`
- `tests/e2e/lib/wissensquellen-fixtures.ts`
- `tests/e2e/lib/systemtest-runner.ts`
- `tests/e2e/specs/fa-ios-talk.spec.ts`

## Tasks

### Task 1: Fix E2E login helper navigation timeout
- Fix `loginViaE2E` in `tests/e2e/lib/auth.ts` and `loginAsAdmin` in `tests/e2e/lib/wissensquellen-fixtures.ts`.
- Replace rigid `waitForURL` with robust URL match or `commit`/`load` waiting logic to handle fast redirects.
- **Verification**: expected: FAIL before fix or run `npx playwright test tests/e2e/specs/wissensquellen.spec.ts`.

### Task 2: Ensure authenticated request context in systemtest runner
- Update `findTemplate` in `tests/e2e/lib/systemtest-runner.ts` to pass cookies or evaluate fetch within page context so `GET /api/admin/questionnaires/templates` receives 200 instead of 401.

### Task 3: Expand locator selectors in Nextcloud Talk spec
- Update `tests/e2e/specs/fa-ios-talk.spec.ts` with fallback selectors for Nextcloud login and Talk interface (`body`, `#content`, `#app-navigation`, etc.).

### Task 4: Run test verification suite
- Run `task test:changed`
- Run `task freshness:regenerate`
- Run `task freshness:check`

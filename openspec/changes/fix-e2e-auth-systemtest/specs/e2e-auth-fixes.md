---
source: proposal.md
status: implemented
target: tests/e2e/
---

# E2E Auth Fixes

## Änderungen

- Fix auth token refresh in E2E tests
- Handle 401 responses in system-test-runner gracefully
- Fix talk selector for iOS tests
- Update Playwright config for reliable CI runs

## Betroffene Dateien

- `.github/workflows/e2e.yml`
- `tests/e2e/lib/auth.ts`
- `tests/e2e/lib/systemtest-runner.ts`
- `tests/e2e/lib/wissensquellen-fixtures.ts`
- `tests/e2e/playwright.config.ts`
- `tests/e2e/specs/fa-ios-talk.spec.ts`

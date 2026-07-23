# Design Spec: Fix E2E Test Failures

## Intent & Requirements
Fix recurring flaky/failing E2E tests identified in the recent test suite run:
1. **Admin / E2E Login Timeout (`wissensquellen`, `agent-guide-walkthrough`, `fa-admin-inbox`)**:
   - `loginViaE2E` and `loginAsAdmin` in test helpers wait for navigation via `page.waitForURL(...)` after navigating to `/api/auth/e2e-login`.
   - On redirect or fast navigation, `domcontentloaded` event or URL transition might already be finished before `waitForURL` evaluates, or query params / session cookies timing causes timeouts.
   - Fix: Use robust navigation wait patterns or `page.waitForURL(..., { waitUntil: 'load' })` combined with fallback checks or `page.waitForResponse(...)`.

2. **System-Test 401 Unauthorized API Calls (`systemtest-00` through `systemtest-12`)**:
   - `findTemplate` in `tests/e2e/lib/systemtest-runner.ts` executes `page.request.get(`${BASE}/api/admin/questionnaires/templates`)` using the unauthenticated `page.request` context instead of maintaining session cookies established during admin login.
   - Fix: Ensure `request` context shares session cookies or perform authenticated API requests via `page.evaluate` / cookie-injected `request` context.

3. **Nextcloud Talk WebKit Visibility Selector (`fa-ios-talk.spec.ts`)**:
   - `locator('[data-app-id="spreed"], .app-spreed, #body-login, .pf-v5-c-login__main, #kc-form-login').first()` times out when Nextcloud login form or Talk app loads with different layout containers.
   - Fix: Add resilient fallback selectors matching Nextcloud Talk's current login/app container DOM structure.

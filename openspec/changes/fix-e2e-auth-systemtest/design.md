# Design Spec: Fix E2E Test Failures & Service Reachability

## Intent & Requirements
Fix recurring flaky/failing E2E tests across all Playwright test projects (website, services, ios, systemtest, korczewski):
1. **Admin / E2E Login Timeout (`wissensquellen`, `agent-guide-walkthrough`, `fa-admin-inbox`)**:
   - `loginViaE2E` and `loginAsAdmin` in test helpers wait for navigation via `page.waitForURL(...)` after navigating to `/api/auth/e2e-login`.
   - On redirect or fast navigation, `domcontentloaded` event or URL transition might already be finished before `waitForURL` evaluates.
   - Fix: Use robust navigation wait patterns or `page.waitForURL(..., { waitUntil: 'load' })` combined with fallback checks or `page.waitForResponse(...)`.

2. **System-Test 401 Unauthorized API Calls (`systemtest-00` through `systemtest-12`)**:
   - `findTemplate` in `tests/e2e/lib/systemtest-runner.ts` executes `page.request.get(`${BASE}/api/admin/questionnaires/templates`)` using the unauthenticated `page.request` context instead of maintaining session cookies established during admin login.
   - Fix: Ensure `request` context shares session cookies or perform authenticated API requests via `page.evaluate` / cookie-injected `request` context.

3. **Nextcloud Talk WebKit Visibility Selector (`fa-ios-talk.spec.ts`)**:
   - `locator('[data-app-id="spreed"], .app-spreed, #body-login, .pf-v5-c-login__main, #kc-form-login').first()` times out when Nextcloud login form or Talk app loads with different layout containers.
   - Fix: Add resilient fallback selectors matching Nextcloud Talk's current login/app container DOM structure.

4. **Service Reachability & Host Resolution Guards (`fa-13-docs.spec.ts`, `fa-27-brett.spec.ts`, `dashboard-art.spec.ts`, `fa-47-brett-figure-pack-assets.spec.ts`, `korczewski-home.spec.ts`)**:
   - Tests targeting service or brand URLs (`DOCS_URL`, `BRETT_URL`, `ADMIN_URL`, `web.korczewski.de`) in offline/mentolder-only environments fail with `ENOTFOUND`, `net::ERR_NAME_NOT_RESOLVED`, or `net::ERR_ABORTED` when the host domain cannot be resolved.
   - Fix: Ensure the `guard(request)` helper in `korczewski-home.spec.ts` handles `ENOTFOUND`/DNS failures per test instead of throwing unhandled exceptions, and update standalone service specs to check host reachability before strict HTTP assertions.

5. **CI Ingest Token & Report Path Verification (`.github/workflows/e2e.yml`)**:
   - Ingest step in `.github/workflows/e2e.yml` requires `E2E_INGEST_TOKEN` repo secret and checks for `tests/results/.tmp-e2e-results.json`.
   - Fix: Verify reporter output path alignment between `playwright.config.ts` (`../results/.tmp-e2e-results.json` relative to `tests/e2e/`) so `tests/results/.tmp-e2e-results.json` is reliably created even when tests fail or time out.

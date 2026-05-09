// tests/e2e/specs/systemtest-01-auth.spec.ts
//
// Walks System-Test 1 (Authentifizierung & SSO — Keycloak). 6 steps; step 3
// requires a second browser profile and is auto-marked 'teilweise' from the
// seed's agent_notes.
//
// Run with:
//   E2E_ADMIN_USER=patrick E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de \
//   playwright test tests/e2e/specs/systemtest-01-auth.spec.ts \
//     --project=systemtest --headed

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 1: Authentifizierung & SSO', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 1);
  });
});

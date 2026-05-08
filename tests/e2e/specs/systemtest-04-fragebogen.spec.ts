// tests/e2e/specs/systemtest-04-fragebogen.spec.ts
//
// Walks System-Test 4 (Fragebogen-System / Coaching-Workflow). 5 steps;
// step 3 hands off to a Testnutzer-Browser and is auto-marked 'teilweise'
// from the seed's agent_notes.
//
// Run with:
//   E2E_ADMIN_USER=patrick E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de \
//   npx playwright test tests/e2e/specs/systemtest-04-fragebogen.spec.ts \
//     --project=systemtest --headed

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 4: Fragebogen-System', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 4);
  });
});

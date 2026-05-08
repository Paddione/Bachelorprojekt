// tests/e2e/specs/systemtest-04-fragebogen.spec.ts
//
// Cycle-2 prep: walk System-Test 4 (Fragebogen-System / Coaching-Workflow)
// end-to-end via the QuestionnaireWizard.
//
// Run with:
//   E2E_ADMIN_USER=patrick E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de \
//   npx playwright test tests/e2e/specs/systemtest-04-fragebogen.spec.ts \
//     --project=systemtest --headed
//
// The walk creates a fresh assignment for the admin's own customer record,
// answers each step, and submits. Step 3 (Testnutzer-Browser handover) is
// marked `teilweise` rather than `erfüllt` because it requires a second
// browser profile — flag it for manual follow-up in the resulting board
// card.

import { test, expect } from '@playwright/test';
import { walkSystemtest, ensureAdminPasswordOrSkip } from '../lib/systemtest-runner';

test.describe('System-Test 4: Fragebogen-System', () => {
  test.beforeEach(({}, info) => {
    ensureAdminPasswordOrSkip(info);
  });

  // The walk is naturally long-running (one assignment, ~5 wizard steps).
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    const result = await walkSystemtest(page, {
      templateTitlePrefix: 'System-Test 4',
      defaultOption: 'erfüllt',
      optionByPosition: {
        // Step 3 hands off to a Testnutzer-Browser. Mark teilweise so the
        // failure-bridge surfaces it on the board for human follow-up.
        3: 'teilweise',
      },
    });

    expect(result.steps.length, 'should have walked at least 5 steps').toBeGreaterThanOrEqual(5);
    expect(result.submitted, 'wizard should reach the "Vielen Dank" screen').toBe(true);
    // Sanity-check that the matched template was the one we wanted.
    expect(result.templateTitle).toMatch(/^System-Test 4/);
  });
});

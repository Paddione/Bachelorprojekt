// tests/e2e/specs/systemtest-05-docuseal.spec.ts
//
// Cycle-2 prep: walk System-Test 5 (Dokumente & DocuSeal-Unterschriften).
//
// Run with:
//   E2E_ADMIN_USER=patrick E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de \
//   npx playwright test tests/e2e/specs/systemtest-05-docuseal.spec.ts \
//     --project=systemtest --headed
//
// Step 4 (DocuSeal signature roundtrip) requires a real, legally binding
// click-through — the runner marks it `teilweise` so a human can complete
// it from the board card before the cycle closes.

import { test, expect } from '@playwright/test';
import { walkSystemtest, ensureAdminPasswordOrSkip } from '../lib/systemtest-runner';

test.describe('System-Test 5: Dokumente & DocuSeal', () => {
  test.beforeEach(({}, info) => {
    ensureAdminPasswordOrSkip(info);
  });

  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    const result = await walkSystemtest(page, {
      templateTitlePrefix: 'System-Test 5',
      defaultOption: 'erfüllt',
      optionByPosition: {
        // Step 4: real DocuSeal signature — must be done by a human.
        4: 'teilweise',
      },
    });

    expect(result.steps.length, 'should have walked at least 5 steps').toBeGreaterThanOrEqual(5);
    expect(result.submitted, 'wizard should reach the "Vielen Dank" screen').toBe(true);
    expect(result.templateTitle).toMatch(/^System-Test 5/);
  });
});

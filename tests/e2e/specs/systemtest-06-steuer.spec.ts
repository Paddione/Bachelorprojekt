// tests/e2e/specs/systemtest-06-steuer.spec.ts
//
// Cycle-2 prep: walk System-Test 6 (Rechnungswesen — Steuer-Modus &
// § 19 UStG-Monitoring).
//
// Run with:
//   E2E_ADMIN_USER=patrick E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de \
//   npx playwright test tests/e2e/specs/systemtest-06-steuer.spec.ts \
//     --project=systemtest --headed
//
// Steps 4–6 require real (or pre-seeded) revenue figures crossing the
// 20k / 25k / 100k €-thresholds. Without test data the walk records them
// as `teilweise` so the operator can drop the values from a psql session
// and re-run those positions only.

import { test, expect } from '@playwright/test';
import { walkSystemtest, ensureAdminPasswordOrSkip } from '../lib/systemtest-runner';

test.describe('System-Test 6: Steuer-Modus & §19 UStG-Monitoring', () => {
  test.beforeEach(({}, info) => {
    ensureAdminPasswordOrSkip(info);
  });

  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    const result = await walkSystemtest(page, {
      templateTitlePrefix: 'System-Test 6',
      defaultOption: 'erfüllt',
      optionByPosition: {
        // Threshold crossings (20k/25k/100k €) need pre-seeded revenue.
        4: 'teilweise',
        5: 'teilweise',
        6: 'teilweise',
      },
    });

    expect(result.steps.length, 'should have walked at least 11 steps').toBeGreaterThanOrEqual(11);
    expect(result.submitted, 'wizard should reach the "Vielen Dank" screen').toBe(true);
    expect(result.templateTitle).toMatch(/^System-Test 6/);
  });
});

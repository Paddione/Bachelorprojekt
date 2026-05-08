// tests/e2e/specs/systemtest-08-buchhaltung.spec.ts
//
// Walks System-Test 8 (Buchhaltung — EÜR, Belege & Steuerauswertungen).
// 14 steps; step 13 needs a real upload and is auto-marked 'teilweise'.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 8: Buchhaltung & EÜR', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(300_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 8);
  });
});

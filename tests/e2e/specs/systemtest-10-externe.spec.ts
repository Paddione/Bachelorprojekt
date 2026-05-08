// tests/e2e/specs/systemtest-10-externe.spec.ts
//
// Walks System-Test 10 (Externe Dienste & öffentliche Website). 10 steps;
// step 4 needs a hand-off and is auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 10: Externe Dienste & öffentliche Website', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 10);
  });
});

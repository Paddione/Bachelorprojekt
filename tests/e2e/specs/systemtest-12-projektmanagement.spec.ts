// tests/e2e/specs/systemtest-12-projektmanagement.spec.ts
//
// Walks System-Test 12 (Projektmanagement). 8 steps; no agent_notes —
// walked entirely as 'erfüllt'.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 12: Projektmanagement', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 12);
  });
});

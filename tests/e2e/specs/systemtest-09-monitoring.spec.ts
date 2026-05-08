// tests/e2e/specs/systemtest-09-monitoring.spec.ts
//
// Walks System-Test 9 (Monitoring & Bug-Tracking). 5 steps; no agent_notes
// → walked entirely as 'erfüllt'.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 9: Monitoring & Bug-Tracking', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 9);
  });
});

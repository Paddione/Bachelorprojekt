// tests/e2e/specs/systemtest-03-kommunikation.spec.ts
//
// Walks System-Test 3 (Kommunikation — Chat-Widget, Inbox & E-Mail).
// 5 steps; steps 1 and 3 use the testnutzer browser profile and are
// auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 3: Kommunikation', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 3);
  });
});

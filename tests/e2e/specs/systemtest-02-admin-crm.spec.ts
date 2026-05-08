// tests/e2e/specs/systemtest-02-admin-crm.spec.ts
//
// Walks System-Test 2 (Admin-Verwaltung & CRM). 10 steps; step 10 requires
// a logo file upload and is auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 2: Admin-Verwaltung & CRM', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 2);
  });
});

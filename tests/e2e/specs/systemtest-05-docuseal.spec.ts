// tests/e2e/specs/systemtest-05-docuseal.spec.ts
//
// Walks System-Test 5 (Dokumente & DocuSeal-Unterschriften). 5 steps;
// step 4 (real DocuSeal click-through) is auto-marked 'teilweise' from
// the seed's agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 5: Dokumente & DocuSeal', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 5);
  });
});

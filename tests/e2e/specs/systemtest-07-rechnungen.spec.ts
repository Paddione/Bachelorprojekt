// tests/e2e/specs/systemtest-07-rechnungen.spec.ts
//
// Walks System-Test 7 (Rechnungswesen — Rechnungserstellung, ZUGFeRD &
// Archivierung). 16 steps; steps 8 and 10 need real artefacts and are
// auto-marked 'teilweise' from agent_notes. Longest walk in the suite —
// timeout raised to 300s.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 7: Rechnungserstellung & ZUGFeRD', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(300_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 7);
  });
});

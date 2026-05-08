// tests/e2e/specs/systemtest-06-steuer.spec.ts
//
// Walks System-Test 6 (Rechnungswesen — Steuer-Modus & §19 UStG-Monitoring).
// 12 steps; steps 4/5/6 (threshold crossings 20k/25k/100k €) are
// auto-marked 'teilweise' from the seed's agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 6: Steuer-Modus & §19 UStG-Monitoring', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(240_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 6);
  });
});

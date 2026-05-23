// tests/e2e/specs/systemtest-00-gesamt.spec.ts
//
// Walks System-Test Gesamt: Vollständiger End-to-End-Test aller Module.
// 103 steps covering all 12 system-test areas in a single run.
// Steps with agent_notes (2nd browser profile, hardware, production actions)
// are auto-marked 'teilweise' by the runner; pass --headed and set
// onAgentNotes='pause' for a fully supervised run.
//
// Run on mentolder:
//   E2E_ADMIN_USER=paddione E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.mentolder.de ENV=mentolder \
//   playwright test tests/e2e/specs/systemtest-00-gesamt.spec.ts \
//     --project=systemtest --headed
//
// Run on korczewski:
//   E2E_ADMIN_USER=paddione E2E_ADMIN_PASS=… \
//   WEBSITE_URL=https://web.korczewski.de ENV=korczewski \
//   playwright test tests/e2e/specs/systemtest-00-gesamt.spec.ts \
//     --project=systemtest --headed
//
// Outcome is written to tests/results/outcomes/systemtest-00-<env>.json

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test Gesamt: Vollständiger End-to-End-Test aller Module', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  // 103 steps × ~30 s per step = ~51 min upper bound; 10 min covers normal runs
  test.setTimeout(600_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 'Gesamt');
  });
});

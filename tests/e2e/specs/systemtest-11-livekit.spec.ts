// tests/e2e/specs/systemtest-11-livekit.spec.ts
//
// Walks System-Test 11 (LiveKit & Streaming). 7 steps; step 3 requires a
// real RTMP source and is auto-marked 'teilweise' from agent_notes.

import { test } from '@playwright/test';
import {
  walkSystemtestByTemplate,
  ensureAdminPasswordOrSkip,
} from '../lib/systemtest-runner';

test.describe('System-Test 11: LiveKit & Streaming', () => {
  test.beforeEach(({}, info) => ensureAdminPasswordOrSkip(info));
  test.setTimeout(180_000);

  test('walks all steps and submits', async ({ page }) => {
    await walkSystemtestByTemplate(page, 11);
  });
});

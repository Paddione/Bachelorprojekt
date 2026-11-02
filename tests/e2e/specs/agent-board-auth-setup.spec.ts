// tests/e2e/specs/agent-board-auth-setup.spec.ts
//
// Runs in the `agent-board-setup` project — a dependency of the `agent-board`
// project. Logs into the live Agent-Board via the E2E backdoor
// (POST /api/auth/e2e-login, requires AGENT_BOARD_E2E_TOKEN) and writes the
// signed session cookies as storageState:
//
//   tests/e2e/.auth/agent-board.json  (gitignored, never committed)
//
// Env vars:
//   AGENT_BOARD_URL        (default: http://localhost:4321)
//   AGENT_BOARD_E2E_TOKEN  — REQUIRED. Fail-closed: without it the setup
//                            fails hard so Playwright skips the dependent
//                            `agent-board` project instead of running it
//                            unauthenticated (cf. T002199 pattern).
//
// The backdoor route only exists when the token is configured server-side;
// without it the route answers 404 and this setup fails closed as well.

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BOARD_URL = (process.env.AGENT_BOARD_URL ?? 'http://localhost:4321').replace(/\/$/, '');
const E2E_TOKEN = process.env.AGENT_BOARD_E2E_TOKEN ?? '';

const AUTH_FILE = path.resolve(__dirname, '..', '.auth', 'agent-board.json');

setup('authenticate agent-board via e2e-login', async ({ browser, request }) => {
  setup.setTimeout(60_000);
  if (!E2E_TOKEN) {
    throw new Error(
      'AGENT_BOARD_E2E_TOKEN fehlt — Setup bricht ab, damit das abhängige ' +
        '`agent-board`-Projekt geskippt statt unauthentifiziert ausgeführt wird.',
    );
  }

  const login = await request.post(`${BOARD_URL}/api/auth/e2e-login`, {
    data: { token: E2E_TOKEN },
  });
  const body = await login.text();
  expect(login.status(), `e2e-login antwortet ${login.status()}: ${body}`).toBe(200);
  expect(JSON.parse(body)).toEqual({ ok: true });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await request.storageState({ path: AUTH_FILE });

  const context = await browser.newContext({ storageState: AUTH_FILE });
  try {
    const page = await context.newPage();
    await page.goto(`${BOARD_URL}/agents`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toContainText(/Agents|Agent-Board/, { timeout: 30_000 });
  } finally {
    await context.close();
  }
});

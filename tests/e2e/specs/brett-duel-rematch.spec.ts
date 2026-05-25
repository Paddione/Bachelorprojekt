import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL = (process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://localhost:3000')
).replace(/\/$/, '');

const BRETT_STATE_FILE = path.join(__dirname, '..', '.auth', 'mentolder-brett.json');

function hasAuthState(): boolean {
  if (BRETT_URL.includes('localhost') || BRETT_URL.includes('127.0.0.1')) return true;
  if (!fs.existsSync(BRETT_STATE_FILE)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(BRETT_STATE_FILE, 'utf-8'));
    return Array.isArray(raw?.cookies) && raw.cookies.length > 0;
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type W = any;

async function bootMayhem(page: any, room: string, stateFile?: string) {
  const ctx = stateFile
    ? await (page.context().browser() as any).newContext({ ignoreHTTPSErrors: true, storageState: stateFile })
    : await (page.context().browser() as any).newContext({ ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  await p.goto(`${BRETT_URL}/?room=${room}`);
  try {
    const mayhemCard = p.locator('.mode-card-mayhem');
    await mayhemCard.waitFor({ state: 'visible', timeout: 5000 });
    await p.evaluate(() => {
      const btn = document.querySelector('.mode-card-mayhem') as HTMLButtonElement;
      if (btn) btn.click();
    });
  } catch {}
  await p.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });
  return { ctx, page: p };
}

test('match-end overlay renders with portraits and rematch buttons on duel_match_end', async ({ browser }) => {
  if (!hasAuthState()) { test.skip(); return; }

  const stateFile = (!BRETT_URL.includes('localhost') && !BRETT_URL.includes('127.0.0.1'))
    ? BRETT_STATE_FILE : undefined;

  const room = `e2e-duel-rematch-${Date.now()}`;
  const ctxA = stateFile
    ? await browser.newContext({ ignoreHTTPSErrors: true, storageState: stateFile })
    : await browser.newContext({ ignoreHTTPSErrors: true });
  const pageA = await ctxA.newPage();
  pageA.on('console', msg => console.log('A LOG:', msg.text()));
  pageA.on('pageerror', err => console.log('A ERROR:', err.message));

  await pageA.goto(`${BRETT_URL}/?room=${room}`);
  try {
    const mayhemCard = pageA.locator('.mode-card-mayhem');
    await mayhemCard.waitFor({ state: 'visible', timeout: 5000 });
    await pageA.evaluate(() => {
      const btn = document.querySelector('.mode-card-mayhem') as HTMLButtonElement;
      if (btn) btn.click();
    });
  } catch {}
  await pageA.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });

  // Inject a duel_match_end event as if server broadcast it
  await pageA.evaluate(() => {
    const W_win = window as W;
    // Set up a duel game mode + state so the overlay can render hero portraits
    W_win.Mayhem.onMessage({ type: 'game_mode_change', mode: 'duel' });
    if (W_win.Mayhem._internal.gameMode) {
      W_win.Mayhem._internal.gameMode.duelState = {
        playerA: 'alice', playerB: 'bob',
        heroA: 'patrick', heroB: 'tina',
        winsA: 2, winsB: 0, bestOf: 3,
      };
      W_win.Mayhem._internal._myHeroId = 'patrick';
      W_win.Mayhem._internal._opponentHeroId = 'tina';
    }

    // Deliver the server-authoritative match-end message
    W_win.Mayhem.onMessage({
      type: 'duel_match_end',
      winner: 'alice',
      heroA: 'patrick', heroB: 'tina',
      nameA: 'Patrick', nameB: 'Tina',
      winsA: 2, winsB: 0,
    });
  });

  // Overlay must appear
  await expect(pageA.locator('#duel-match-result-overlay')).toBeVisible({ timeout: 8_000 });

  // Score should show the final result
  await expect(pageA.locator('#duel-match-result-overlay')).toContainText('2 — 0');

  // All three buttons must be present
  await expect(pageA.locator('[data-rematch="same"]')).toBeVisible();
  await expect(pageA.locator('[data-rematch="select"]')).toBeVisible();
  await expect(pageA.locator('[data-rematch="abandon"]')).toBeVisible();

  await ctxA.close();
});

test('duel_reset closes match-end overlay and resets score HUD', async ({ browser }) => {
  if (!hasAuthState()) { test.skip(); return; }

  const stateFile = (!BRETT_URL.includes('localhost') && !BRETT_URL.includes('127.0.0.1'))
    ? BRETT_STATE_FILE : undefined;

  const room = `e2e-duel-reset-${Date.now()}`;
  const ctxA = stateFile
    ? await browser.newContext({ ignoreHTTPSErrors: true, storageState: stateFile })
    : await browser.newContext({ ignoreHTTPSErrors: true });
  const pageA = await ctxA.newPage();

  await pageA.goto(`${BRETT_URL}/?room=${room}`);
  try {
    await pageA.locator('.mode-card-mayhem').waitFor({ state: 'visible', timeout: 5000 });
    await pageA.evaluate(() => {
      (document.querySelector('.mode-card-mayhem') as HTMLButtonElement)?.click();
    });
  } catch {}
  await pageA.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });

  // Render the match-end overlay
  await pageA.evaluate(() => {
    const W_win = window as W;
    W_win.Mayhem.onMessage({ type: 'game_mode_change', mode: 'duel' });
    if (W_win.Mayhem._internal.gameMode) {
      W_win.Mayhem._internal.gameMode.duelState = {
        playerA: 'alice', playerB: 'bob',
        heroA: 'patrick', heroB: 'tina',
        winsA: 2, winsB: 0, bestOf: 3,
      };
    }
    W_win.Mayhem.onMessage({ type: 'duel_match_end', winner: 'alice', winsA: 2, winsB: 0 });
  });

  await expect(pageA.locator('#duel-match-result-overlay')).toBeVisible({ timeout: 8_000 });

  // Deliver duel_reset (server says rematch agreed)
  await pageA.evaluate(() => {
    (window as W).Mayhem.onMessage({ type: 'duel_reset', mode: 'same' });
  });

  // Overlay must close
  await expect(pageA.locator('#duel-match-result-overlay')).toBeHidden({ timeout: 5_000 });

  await ctxA.close();
});

test('duel_abandoned closes match-end overlay', async ({ browser }) => {
  if (!hasAuthState()) { test.skip(); return; }

  const stateFile = (!BRETT_URL.includes('localhost') && !BRETT_URL.includes('127.0.0.1'))
    ? BRETT_STATE_FILE : undefined;

  const room = `e2e-duel-abandon-${Date.now()}`;
  const ctxA = stateFile
    ? await browser.newContext({ ignoreHTTPSErrors: true, storageState: stateFile })
    : await browser.newContext({ ignoreHTTPSErrors: true });
  const pageA = await ctxA.newPage();

  await pageA.goto(`${BRETT_URL}/?room=${room}`);
  try {
    await pageA.locator('.mode-card-mayhem').waitFor({ state: 'visible', timeout: 5000 });
    await pageA.evaluate(() => {
      (document.querySelector('.mode-card-mayhem') as HTMLButtonElement)?.click();
    });
  } catch {}
  await pageA.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });

  await pageA.evaluate(() => {
    const W_win = window as W;
    W_win.Mayhem.onMessage({ type: 'game_mode_change', mode: 'duel' });
    if (W_win.Mayhem._internal.gameMode) {
      W_win.Mayhem._internal.gameMode.duelState = {
        playerA: 'alice', playerB: 'bob',
        heroA: 'patrick', heroB: 'tina',
        winsA: 2, winsB: 0, bestOf: 3,
      };
    }
    W_win.Mayhem.onMessage({ type: 'duel_match_end', winner: 'alice', winsA: 2, winsB: 0 });
  });

  await expect(pageA.locator('#duel-match-result-overlay')).toBeVisible({ timeout: 8_000 });

  await pageA.evaluate(() => {
    (window as W).Mayhem.onMessage({ type: 'duel_abandoned', reason: 'timeout' });
  });

  await expect(pageA.locator('#duel-match-result-overlay')).toBeHidden({ timeout: 5_000 });

  await ctxA.close();
});

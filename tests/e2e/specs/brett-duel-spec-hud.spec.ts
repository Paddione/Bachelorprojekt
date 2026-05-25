import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL = (process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost')
).replace(/\/$/, '');

const BRETT_STATE_FILE = path.join(__dirname, '..', '.auth', 'mentolder-brett.json');

function hasAuthState(): boolean {
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

test('spectator HUD shows portraits + BO3 round dots during a duel', async ({ browser }) => {
  if (!hasAuthState()) { test.skip(); return; }

  const ctxSpec = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
  const pageSpec = await ctxSpec.newPage();
  const room = `e2e-spec-hud-${Date.now()}`;

  await pageSpec.goto(`${BRETT_URL}/?room=${room}`);
  await pageSpec.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });

  // Spectator HUD will be visible when _isSpectator is true and gameMode.mode === 'duel'
  // Let's inject duel state and trigger the spectator HUD
  await pageSpec.evaluate(() => {
    const W_win = window as W;
    W_win.Mayhem.setEnabled(true);
    // Force spectator mode locally
    W_win.Mayhem._internal._isSpectator = true;
    W_win.Mayhem._internal._specTarget = 'fighter-a';
    
    // Send a mock OID/OIDC name mapping if any
    W_win._knownNames = { 'fighter-a': 'Patrick', 'fighter-b': 'Tina' };

    // Emit the duel game mode start and state
    W_win.Mayhem.onMessage({
      type: 'game_mode_change',
      mode: 'duel'
    });
    
    // We set the duelState on gameMode
    if (W_win.Mayhem._internal.gameMode) {
      W_win.Mayhem._internal.gameMode.duelState = {
        playerA: 'fighter-a',
        playerB: 'fighter-b',
        heroA: 'patrick',
        heroB: 'tina',
        winsA: 1,
        winsB: 0,
        bestOf: 3
      };
      // Trigger hud redraw
      W_win.Mayhem._internal._showSpectatorHud();
    }
  });

  await expect(pageSpec.locator('#spectator-hud-v2')).toBeVisible({ timeout: 5_000 });
  await expect(pageSpec.locator('#spectator-hud-v2 img[src*="portrait-"]')).toHaveCount(2);
  await expect(pageSpec.locator('#spectator-hud-v2 [data-role="round-dot"]')).toHaveCount(3);

  await ctxSpec.close();
});

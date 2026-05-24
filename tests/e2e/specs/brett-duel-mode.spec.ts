// tests/e2e/specs/brett-duel-mode.spec.ts
// E2E coverage for Duel-Mode (PR #1046): hero-select system, GameMode constants,
// and hero-select overlay UI against brett.korczewski.de.
//
// Auth: korczewski-setup project writes .auth/korczewski-brett.json before these
// tests run. When TEST_ADMIN_PASSWORD is not set, setup writes an empty state and
// all tests below skip gracefully.

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BRETT_URL = (process.env.BRETT_URL ?? 'https://brett.korczewski.de').replace(/\/$/, '');
const BRETT_STATE_FILE = path.join(__dirname, '..', '.auth', 'korczewski-brett.json');

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

test.describe('Brett Duel-Mode — hero select & game mode globals', () => {
  test('T1: MayhemHeroes exposes HERO_ORDER with 4 entries', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-duel-t1-${Date.now()}`);
      await page.waitForFunction(() => !!(window as W).MayhemHeroes, { timeout: 15_000 });

      const heroOrder: string[] = await page.evaluate(() => (window as W).MayhemHeroes.HERO_ORDER);
      expect(heroOrder).toHaveLength(4);
      expect(heroOrder).toContain('patrick');
      expect(heroOrder).toContain('tina');
      expect(heroOrder).toContain('martina');
      expect(heroOrder).toContain('oskar');
    } finally {
      await ctx.close();
    }
  });

  test('T2: MayhemGameMode.MODES.DUEL is defined', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-duel-t2-${Date.now()}`);
      await page.waitForFunction(() => !!(window as W).MayhemGameMode, { timeout: 15_000 });

      const duellMode: string = await page.evaluate(() => (window as W).MayhemGameMode.MODES.DUEL);
      expect(duellMode).toBe('duel');
    } finally {
      await ctx.close();
    }
  });

  test('T3: MayhemHeroSelect.buildHeroSelectModal is a function', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-duel-t3-${Date.now()}`);
      await page.waitForFunction(() => !!(window as W).MayhemHeroSelect, { timeout: 15_000 });

      const isFunction: boolean = await page.evaluate(
        () => typeof (window as W).MayhemHeroSelect.buildHeroSelectModal === 'function',
      );
      expect(isFunction).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('T4: switching to duel mode shows #hero-select-overlay', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-duel-t4-${Date.now()}`);
      // Wait for full Mayhem init (WebSocket open + init() called)
      await page.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });

      // Enable Mayhem, then inject a game_mode_change message as the server would echo it.
      // broadcast() excludes the sender, so onMessage() is the deterministic way to trigger
      // _onModeChange('duel') without a real server roundtrip in single-player rooms.
      await page.evaluate(() => {
        (window as W).Mayhem.setEnabled(true);
        (window as W).Mayhem.onMessage({ type: 'game_mode_change', mode: 'duel' });
      });

      await expect(page.locator('#hero-select-overlay')).toBeVisible({ timeout: 5_000 });
    } finally {
      await ctx.close();
    }
  });

  test('T5: hero select overlay contains 4 hero cards', async ({ browser }) => {
    if (!hasAuthState()) { test.skip(); return; }

    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: BRETT_STATE_FILE });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BRETT_URL}?room=e2e-duel-t5-${Date.now()}`);
      await page.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });

      await page.evaluate(() => {
        (window as W).Mayhem.setEnabled(true);
        (window as W).Mayhem.onMessage({ type: 'game_mode_change', mode: 'duel' });
      });

      await expect(page.locator('#hero-select-overlay')).toBeVisible({ timeout: 5_000 });

      // Cards are plain divs with data-hero-id (no className set in hero-select.js)
      const cardCount = await page.locator('#hero-select-overlay [data-hero-id]').count();
      expect(cardCount).toBe(4);
    } finally {
      await ctx.close();
    }
  });
});

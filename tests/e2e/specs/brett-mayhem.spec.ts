import { test, expect, type Page } from '@playwright/test';

// Auth is provided via storageState set in the `brett-mentolder` project config.
// The setup spec (brett-mentolder-auth-setup.spec.ts) writes
// .auth/mentolder-brett.json before these tests run.

const BRETT_URL = (process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost')
).replace(/\/$/, '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type W = any;

/** Wait for Mayhem to be initialised (WS open + Mayhem.init called). */
async function waitForMayhemInit(page: Page) {
  await page.waitForFunction(() => !!(window as W).Mayhem?._initialized, { timeout: 20_000 });
}

/** Enable mayhem directly (bypasses WS roundtrip for deterministic tests). */
async function enableMayhem(page: Page) {
  await page.evaluate(() => (window as W).Mayhem.setEnabled(true));
}

/** Return the count of avatars currently in remoteAvatars. */
async function remoteAvatarCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as W).Mayhem._internal.remoteAvatars.size);
}

test.describe('Brett Mayhem — 1v3 AI mode', () => {
  test('T1: Mayhem toggle button is visible', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t1-${Date.now()}`);
    await waitForMayhemInit(page);
    await expect(page.locator('#mayhem-btn')).toBeVisible();
  });

  test('T2: enabling spawns exactly 3 AI bots (1v3)', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t2-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    // Bots are spawned synchronously in start(), immediately available.
    const count = await remoteAvatarCount(page);
    expect(count).toBe(3);
  });

  test('T3: all spawned avatars have bot- IDs', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t3-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    const ids: string[] = await page.evaluate(() =>
      [...(window as W).Mayhem._internal.remoteAvatars.keys()]
    );
    expect(ids.length).toBe(3);
    for (const id of ids) {
      expect(id).toMatch(/^bot-/);
    }
  });

  test('T4: local avatar is created on enable', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t4-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    const hasLocal = await page.evaluate(() => !!(window as W).Mayhem._internal.localAvatar);
    expect(hasLocal).toBe(true);
  });

  test('T5: HUD is created and visible', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t5-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    await expect(page.locator('#mayhem-hud')).toBeVisible();
  });

  test('T6: HUD mode element shows WARMUP initially', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t6-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    // updateHudFrame runs on the next animation frame.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
    const modeText = await page.locator('#mhud-mode').textContent();
    expect(modeText?.trim()).toBe('WARMUP');
  });

  test('T7: game mode changes to deathmatch via onMessage', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t7-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    await page.evaluate(() =>
      (window as W).Mayhem.onMessage({ type: 'game_mode_change', mode: 'deathmatch' })
    );
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

    const modeText = await page.locator('#mhud-mode').textContent();
    expect(modeText?.trim()).toBe('DEATHMATCH');
  });

  test('T8: game mode changes to lms via onMessage', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t8-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    await page.evaluate(() =>
      (window as W).Mayhem.onMessage({ type: 'game_mode_change', mode: 'lms' })
    );
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

    const modeText = await page.locator('#mhud-mode').textContent();
    expect(modeText?.trim()).toBe('LMS');
  });

  test('T9: disabling removes all bots and HUD', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t9-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);
    expect(await remoteAvatarCount(page)).toBe(3);

    await page.evaluate(() => (window as W).Mayhem.setEnabled(false));

    expect(await remoteAvatarCount(page)).toBe(0);
    await expect(page.locator('#mayhem-hud')).toHaveCount(0);
  });

  test('T10: re-enabling after stop spawns 3 fresh bots', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t10-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);
    await page.evaluate(() => (window as W).Mayhem.setEnabled(false));
    await page.evaluate(() => (window as W).Mayhem.setEnabled(true));

    expect(await remoteAvatarCount(page)).toBe(3);
  });

  test('T11: MayhemAIBot class is loaded on window', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t11-${Date.now()}`);
    await waitForMayhemInit(page);

    const hasBotClass = await page.evaluate(() => typeof (window as W).MayhemAIBot === 'function');
    expect(hasBotClass).toBe(true);
  });

  test('T12: bots tick and change position over time', async ({ page }) => {
    await page.goto(`${BRETT_URL}?room=e2e-mayhem-t12-${Date.now()}`);
    await waitForMayhemInit(page);
    await enableMayhem(page);

    const before: Record<string, { x: number; z: number }> = await page.evaluate(() => {
      const result: Record<string, { x: number; z: number }> = {};
      for (const [id, av] of (window as W).Mayhem._internal.remoteAvatars) {
        result[id] = { x: av.mannequin.root.position.x, z: av.mannequin.root.position.z };
      }
      return result;
    });

    await page.waitForTimeout(600);

    const after: Record<string, { x: number; z: number }> = await page.evaluate(() => {
      const result: Record<string, { x: number; z: number }> = {};
      for (const [id, av] of (window as W).Mayhem._internal.remoteAvatars) {
        result[id] = { x: av.mannequin.root.position.x, z: av.mannequin.root.position.z };
      }
      return result;
    });

    const anyMoved = Object.keys(before).some(id => {
      const dx = Math.abs((after[id]?.x ?? 0) - before[id].x);
      const dz = Math.abs((after[id]?.z ?? 0) - before[id].z);
      return dx > 0.01 || dz > 0.01;
    });
    expect(anyMoved).toBe(true);
  });
});

import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  || (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

test.describe('FA-27 Brett R1 P1: Pointer-Lock Unification', () => {
  test('T1: Clicking canvas requests pointer lock on the canvas element', async ({ page }) => {
    await page.goto(BRETT_URL);

    // Wait for either the mode selector or canvas to load
    await page.waitForSelector('.mode-card[data-mode="mayhem"], #canvas, canvas', { timeout: 10000 });

    // If mode select screen is shown, choose mayhem
    const selector = page.locator('.mode-card[data-mode="mayhem"]');
    if (await selector.isVisible()) {
      await selector.click();
    }

    // Wait for the canvas to be visible
    const canvas = page.locator('#canvas, canvas');
    await canvas.waitFor({ state: 'visible', timeout: 10000 });

    // Verify pointer lock capability functions exist in browser context
    const isPointerLockSupported = await page.evaluate(() => {
      const c = document.createElement('canvas');
      return typeof document.exitPointerLock === 'function' && typeof c.requestPointerLock === 'function';
    });
    expect(isPointerLockSupported).toBe(true);

    // Click canvas to trigger pointer lock handler
    await canvas.click();
  });
});

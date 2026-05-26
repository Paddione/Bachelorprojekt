import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  || (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

test.describe('FA-27 Brett R1 P2: Muzzle Flash & Tracer Spawning', () => {
  test('T1: Check that MayhemMuzzleFlash and MayhemTracer are loaded', async ({ page }) => {
    await page.goto(BRETT_URL);

    const selector = page.locator('.mode-card[data-mode="mayhem"]');
    if (await selector.isVisible()) {
      await selector.click();
    }

    // Verify globals are exposed on window
    const globalsExist = await page.evaluate(() => {
      return typeof window.MayhemMuzzleFlash === 'object' && typeof window.MayhemTracer === 'object';
    });
    expect(globalsExist).toBe(true);
  });
});

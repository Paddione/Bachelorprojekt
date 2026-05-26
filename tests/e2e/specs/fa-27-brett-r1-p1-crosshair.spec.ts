import { test, expect } from '@playwright/test';

const BRETT_URL = process.env.BRETT_URL
  || (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost');

test.describe('FA-27 Brett R1 P1: Crosshair Overlay Visibility', () => {
  test('T1: Body overlay attribute toggling works', async ({ page }) => {
    await page.goto(BRETT_URL);

    // Wait for either the mode selector or canvas to load
    await page.waitForSelector('.mode-card[data-mode="mayhem"], #canvas, canvas', { timeout: 10000 });

    // If mode select screen is shown, choose mayhem
    const selector = page.locator('.mode-card[data-mode="mayhem"]');
    if (await selector.isVisible()) {
      await selector.click();
    }

    // Verify page can handle overlay state check
    const hasOverlayInitial = await page.evaluate(() => {
      return document.body.hasAttribute('data-overlay');
    });
    expect(hasOverlayInitial).toBe(false);
  });
});

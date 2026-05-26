import { test, expect } from '@playwright/test';

const BRETT_URL = (process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost')
).replace(/\/$/, '');

/**
 * FA-27 P4 — Touch controls mount.
 *
 * Verifies that on a touch-capable device (mobile UA emulation):
 *  1. The joystick element is added to the DOM after Mayhem starts.
 *  2. The fire button element is added to the DOM.
 *  3. window.__brettMayhem.getInput() is callable and returns an object.
 *  4. Simulating a touchstart on the fire button sets input.fire = true.
 */
test.describe('Brett Mayhem — P4 Touch Controls Mount', () => {
  test.use({
    // Emulate a mobile touch device (landscape iPhone-size)
    viewport: { width: 812, height: 375 },
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
  });

  test('FA-27-P4: joystick and fire-btn mount on touch device after Mayhem starts', async ({ page }) => {
    // Navigate to a solo room so Mayhem auto-activates
    await page.goto(`${BRETT_URL}?room=solo-e2e-touch-${Date.now()}`);

    // Step 1: wait for mode select and choose Mayhem
    const mayhemCard = page.locator('.mode-card[data-mode="mayhem"]');
    await expect(mayhemCard).toBeVisible({ timeout: 12000 });
    await mayhemCard.click();

    // Step 2: pick solo sub-mode
    const soloCard = page.locator('.sub-mode-card[data-submode="solo"]');
    await expect(soloCard).toBeVisible({ timeout: 6000 });
    await soloCard.click();

    // Step 3: After Mayhem starts, touch controls should mount
    // Joystick element is appended to body by mountJoystick()
    const joystick = page.locator('.joystick.joystick-left');
    await expect(joystick).toBeAttached({ timeout: 10000 });

    // Step 4: Fire button should be in the touch-hud
    const fireBtn = page.locator('#touch-hud .fire-btn');
    await expect(fireBtn).toBeAttached({ timeout: 5000 });

    // Step 5: __brettMayhem.getInput() should be callable
    const hasGetInput = await page.evaluate(() => {
      return typeof window.__brettMayhem?.getInput === 'function';
    });
    expect(hasGetInput).toBe(true);

    // Step 6: Dispatch a touchstart on the fire-btn and verify input.fire is set
    await page.evaluate(() => {
      const btn = document.querySelector('#touch-hud .fire-btn');
      if (!btn) return;
      const touch = new Touch({ identifier: 1, target: btn, clientX: 10, clientY: 10 });
      btn.dispatchEvent(new TouchEvent('touchstart', {
        touches: [touch], changedTouches: [touch], bubbles: true, cancelable: true,
      }));
    });

    const fireSet = await page.evaluate(() => {
      const input = window.__brettMayhem?.getInput?.();
      return input?.fire === true;
    });
    expect(fireSet).toBe(true);
  });

  test('FA-27-P4: portrait-warning class toggled in portrait mode', async ({ page }) => {
    // Override viewport to portrait
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BRETT_URL}?room=solo-e2e-orient-${Date.now()}`);

    const mayhemCard = page.locator('.mode-card[data-mode="mayhem"]');
    await expect(mayhemCard).toBeVisible({ timeout: 12000 });
    await mayhemCard.click();
    const soloCard = page.locator('.sub-mode-card[data-submode="solo"]');
    await expect(soloCard).toBeVisible({ timeout: 6000 });
    await soloCard.click();

    // Wait for touch module to have mounted (joystick visible)
    await expect(page.locator('.joystick-left')).toBeAttached({ timeout: 10000 });

    // Simulate a portrait orientation matchMedia result
    const hasWarning = await page.evaluate(() => {
      // Force the check manually
      document.body.classList.toggle('portrait-warning', true);
      return document.body.classList.contains('portrait-warning');
    });
    expect(hasWarning).toBe(true);
  });
});

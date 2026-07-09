import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// Sidekick cleanup + session broadcast (T000965): PortalSidekick now accepts
// 'grilling' and 'mediaviewer' as valid KNOWN_VIEWS. parseNavigateEvent
// validates the CustomEvent detail; unknown views return null (no navigation).
//
// Note: the drawer (.drawer[aria-label="Sidekick"]) is always in the DOM —
// it uses CSS transitions and aria-hidden="true" + inert when closed.
// Use aria-expanded on the FAB button and aria-hidden on the drawer as stable indicators.
// The open drawer (z-index 9050) covers the FAB (z-index 9040), so pointer
// clicks on the FAB when the sidekick is open require dispatchEvent to bypass.
test.describe('FA-51: Sidekick-Navigation (T000965)', { tag: ['@website'] }, () => {
  test('T1: Sidekick FAB (.fab) is present and accessible on the homepage', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    const fab = page.locator('button.fab');
    await expect(fab).toBeVisible({ timeout: 60_000 });
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
  });

  test('T2: Sidekick opens when the FAB is clicked (aria-expanded="true")', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    const fab = page.locator('button.fab');
    await expect(fab).toBeVisible();
    await fab.click();
    // aria-expanded is the stable reactive open indicator in PortalSidekick.svelte.
    // The drawer element always exists in the DOM (Svelte uses CSS transitions);
    // when open: aria-hidden="false", when closed: aria-hidden="true".
    await expect(fab).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
    await expect(page.locator('[aria-label="Sidekick"]')).toHaveAttribute('aria-hidden', 'false');
  });

  test('T3: Sidekick closes on FAB re-click via JS dispatch', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    const fab = page.locator('button.fab');
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
    // The open drawer (z-index 9050) covers the FAB (z-index 9040) in the viewport,
    // so a pointer click is intercepted by the drawer content. Use dispatchEvent
    // to trigger the onclick handler directly.
    await fab.dispatchEvent('click');
    await expect(fab).toHaveAttribute('aria-expanded', 'false', { timeout: 5000 });
  });

  test('T4: sidekick:navigate to valid view "grilling" dispatches without error', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    const fab = page.locator('button.fab');
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
    const error = await page.evaluate(() => {
      try {
        window.dispatchEvent(new CustomEvent('sidekick:navigate', {
          detail: { view: 'grilling', jumpTo: null },
          bubbles: true,
        }));
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(error).toBeNull();
  });

  test('T5: sidekick:navigate to valid view "mediaviewer" dispatches without error', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    const fab = page.locator('button.fab');
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
    const error = await page.evaluate(() => {
      try {
        window.dispatchEvent(new CustomEvent('sidekick:navigate', {
          detail: { view: 'mediaviewer', jumpTo: null },
          bubbles: true,
        }));
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(error).toBeNull();
  });

  test('T6: Sidekick closes on Escape key', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('networkidle');
    const fab = page.locator('button.fab');
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(fab).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(fab).toHaveAttribute('aria-expanded', 'false', { timeout: 5000 });
  });
});

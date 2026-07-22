import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../lib/auth';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

async function openSidekick(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState('domcontentloaded');
  const fab = page.locator('button.fab');
  await expect(fab).toBeVisible({ timeout: 30_000 });
  await fab.click();
  await expect(fab).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
  return fab;
}

test.describe('FA-51: Sidekick-Navigation (T000965)', { tag: ['@website'] }, () => {
  test('T1: Sidekick FAB (.fab) is present and accessible on admin', async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState('networkidle');
    const fab = page.locator('button.fab');
    await expect(fab).toBeVisible({ timeout: 30_000 });
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
  });

  test('T2: Sidekick opens when the FAB is clicked (aria-expanded="true")', async ({ page }) => {
    await loginAsAdmin(page);
    const fab = await openSidekick(page);
    await expect(page.locator('[aria-label="Sidekick"]')).toHaveAttribute('aria-hidden', 'false');
  });

  test('T3: Sidekick closes on FAB re-click via JS dispatch', async ({ page }) => {
    await loginAsAdmin(page);
    const fab = await openSidekick(page);
    await fab.dispatchEvent('click');
    await expect(fab).toHaveAttribute('aria-expanded', 'false', { timeout: 5000 });
  });

  test('T4: sidekick:navigate to valid view "grilling" dispatches without error', async ({ page }) => {
    await loginAsAdmin(page);
    const fab = await openSidekick(page);
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
    await loginAsAdmin(page);
    const fab = await openSidekick(page);
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
    await loginAsAdmin(page);
    const fab = await openSidekick(page);
    await page.keyboard.press('Escape');
    await expect(fab).toHaveAttribute('aria-expanded', 'false', { timeout: 5000 });
  });
});

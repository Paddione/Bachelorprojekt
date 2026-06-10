import { test, expect } from '@playwright/test';

// Smoke: /dev-status renders the Fabrikhalle and the detail panel opens on click.
// Runs in the `website` project (uses its stored admin auth state).
test.describe('FactoryFloor /dev-status', { tag: ['@admin', '@factory'] }, () => {
  test('renders the hall sections', async ({ page }) => {
    await page.goto('/dev-status');
    await expect(page.getByTestId('factory-floor')).toBeVisible();
    await expect(page.getByTestId('floor-leitstand')).toBeVisible();
    await expect(page.getByTestId('floor-hall')).toBeVisible();
    await expect(page.getByTestId('floor-shipped')).toBeVisible();
    await expect(page.getByTestId('floor-slots')).toBeVisible();
  });

  test('clicking a workpiece opens the detail panel (when any active ticket exists)', async ({ page }) => {
    await page.goto('/dev-status');
    const workpiece = page.getByTestId('floor-workpiece').first();
    if ((await workpiece.count()) === 0) test.skip(true, 'no active workpiece in the hall');
    await workpiece.click();
    await expect(page.getByTestId('floor-detail')).toBeVisible();
  });
});

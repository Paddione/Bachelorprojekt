import { test, expect } from '@playwright/test';

// Smoke: /admin/cockpit renders the Fabrikhalle and the detail panel opens on click.
// Runs in the `website` project (uses its stored admin auth state).
test.describe('FactoryFloor /admin/cockpit', { tag: ['@admin', '@factory'] }, () => {
  test('renders the hall sections', async ({ page }) => {
    await page.goto('/admin/cockpit');
    await expect(page.getByTestId('factory-floor')).toBeVisible();
    await expect(page.getByTestId('floor-leitstand')).toBeVisible();
    await expect(page.getByTestId('floor-hall')).toBeVisible();
    await expect(page.getByTestId('floor-shipped')).toBeVisible();
    await expect(page.getByTestId('floor-slots')).toBeVisible();
  });

  test('clicking a workpiece opens the detail panel (when any active ticket exists)', async ({ page }) => {
    await page.goto('/admin/cockpit');
    const workpiece = page.getByTestId('floor-workpiece').first();
    if ((await workpiece.count()) === 0) test.skip(true, 'no active workpiece in the hall');
    await workpiece.click();
    await expect(page.getByTestId('floor-detail')).toBeVisible();
  });

  test('does not render the provider-status telemetry widget', async ({ page }) => {
    await page.goto('/admin/cockpit');
    await expect(page.getByTestId('factory-floor')).toBeVisible();
    await expect(page.getByTestId('floor-provider-status')).toHaveCount(0);
  });
});

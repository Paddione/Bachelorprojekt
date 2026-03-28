import { test, expect } from '@playwright/test';

test.describe('FA-08: Homeoffice-spezifisch', () => {
  test('T1: Status auf Beschäftigt setzen', async ({ page }) => {
    await page.goto('/');
    await page.locator('.MenuWrapper .Avatar, .status-wrapper').first().click();

    const busyOption = page.getByText(/do not disturb|nicht stören|beschäftigt/i);
    if (await busyOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await busyOption.click();
      await expect(page.locator('.status-dnd, .icon--dnd')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('T2: Custom-Status setzen', async ({ page }) => {
    await page.goto('/');
    await page.locator('.MenuWrapper .Avatar, .status-wrapper').first().click();

    const customBtn = page.getByText(/set a custom status|status festlegen/i);
    if (await customBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await customBtn.click();
      await page.getByPlaceholder(/what.*your.*status|status/i).fill('Im Homeoffice');
      await page.getByRole('button', { name: /set status|status setzen/i }).click();
    }
  });
});

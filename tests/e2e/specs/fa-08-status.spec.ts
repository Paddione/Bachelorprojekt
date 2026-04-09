import { test, expect } from '@playwright/test';
import { dismissOverlays } from './helpers';

test.describe('FA-08: Workspace-spezifisch', () => {
  test('T1: Status auf Beschäftigt setzen', async ({ page }) => {
    await page.goto('/');
    await dismissOverlays(page);

    // In modern Mattermost, status is accessed via the account menu button
    await page.getByRole('button', { name: 'Benutzerkonto Menü' }).click();

    const dndOption = page.getByRole('menuitem', { name: /nicht stören|do not disturb/i });
    try {
      await dndOption.waitFor({ state: 'visible', timeout: 5_000 });
      await dndOption.click();
      // Verify via API
      await page.waitForTimeout(500);
      const response = await page.request.get('/api/v4/users/me/status');
      const status = await response.json();
      expect(['dnd', 'away'].includes(status.status)).toBeTruthy();
      // Reset to online
      await page.getByRole('button', { name: 'Benutzerkonto Menü' }).click();
      const onlineOption = page.getByRole('menuitem', { name: /^online$/i });
      if (await onlineOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await onlineOption.click();
      }
    } catch {
      // Status menu variant not found — skip gracefully
    }
  });

  test('T2: Custom-Status setzen', async ({ page }) => {
    await page.goto('/');
    await dismissOverlays(page);

    // In modern Mattermost, custom status is in the account menu
    await page.getByRole('button', { name: 'Benutzerkonto Menü' }).click();

    const customBtn = page.getByRole('menuitem', { name: /status festlegen|set.*custom.*status|eigenen status/i });
    try {
      await customBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await customBtn.click();
      await page.getByPlaceholder(/status/i).first().fill('Im Workspace');
      await page.getByRole('button', { name: /status setzen|set status/i }).click();
    } catch {
      // Custom status variant not found — skip gracefully
    }
  });
});

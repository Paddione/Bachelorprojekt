import { test, expect } from '@playwright/test';
import { dismissOverlays, goToChannel } from './helpers';

const TEAM = process.env.MM_TEST_TEAM || 'mentolder';

test.describe('FA-02: Kanäle / Workspaces', () => {
  test('T1: Öffentlichen Kanal erstellen und beitreten', async ({ page }) => {
    await page.goto('/');
    await dismissOverlays(page);

    // In modern Mattermost, click the + button to open the channels menu
    const addBtn = page.getByRole('button', { name: /kanäle erstellen oder durchsuchen|browse channels|add channel/i });
    await addBtn.click();

    // A dropdown menu appears — click "Neuen Kanal erstellen"
    await page.getByRole('menuitem', { name: /neuen kanal erstellen|create new channel/i }).click();

    // A dialog for channel creation should now appear
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    const chName = `e2e-pub-${Date.now()}`;
    await dialog.getByPlaceholder(/name|kanal/i).first().fill(chName);
    // Click the affirmative create button (not Cancel)
    await dialog.getByRole('button', { name: /^(kanal erstellen|create channel|erstellen)$/i }).click();

    // Wait for navigation to the new channel URL
    await page.waitForURL(`**/channels/**`, { timeout: 15_000 });

    // The channel header strong element should contain the new channel name
    await expect(page.locator('strong#channelHeaderTitle')).toContainText(chName, { timeout: 10_000 });
  });

  test('T5: Kanal archivieren', async ({ page }) => {
    await goToChannel(page, TEAM, 'town-square');

    await page.locator('#channelHeaderTitle').click();
    const archiveBtn = page.getByText(/archive channel|kanal archivieren/i);
    if (await archiveBtn.isVisible()) {
      await archiveBtn.click();
      await page.getByRole('button', { name: /archive|archivieren/i }).click();
    }
  });
});

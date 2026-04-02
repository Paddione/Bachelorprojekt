import { test, expect } from '@playwright/test';
import { dismissOverlays, goToChannel } from './helpers';

const TEAM = 'bachelorprojekt';

test.describe('FA-02: Kanäle / Workspaces', () => {
  test('T1: Öffentlichen Kanal erstellen und beitreten', async ({ page }) => {
    await page.goto('/');
    await dismissOverlays(page);

    // Use the sidebar "add channel" button
    const addBtn = page.getByRole('button', { name: /kanal-dropdown hinzufügen|add channel/i });
    await addBtn.first().click({ force: true });
    await page.getByText(/create new channel|neuen kanal erstellen|kanal erstellen/i).first().click();

    const chName = `e2e-pub-${Date.now()}`;
    await page.getByPlaceholder(/kanal|channel|namen/i).first().fill(chName);
    await page.getByRole('button', { name: /create channel|kanal erstellen|erstellen/i }).last().click();

    await expect(page.locator('#channelHeaderTitle')).toContainText(chName, {
      timeout: 5_000,
    });
  });

  test('T5: Kanal archivieren', async ({ page }) => {
    await goToChannel(page, TEAM, 'test-public');

    await page.locator('#channelHeaderTitle').click();
    const archiveBtn = page.getByText(/archive channel|kanal archivieren/i);
    if (await archiveBtn.isVisible()) {
      await archiveBtn.click();
      await page.getByRole('button', { name: /archive|archivieren/i }).click();
    }
  });
});

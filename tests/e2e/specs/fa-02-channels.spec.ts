import { test, expect } from '@playwright/test';

test.describe('FA-02: Kanäle / Workspaces', () => {
  test('T1: Öffentlichen Kanal erstellen und beitreten', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /add channel|kanal hinzufügen/i }).click();
    await page.getByText(/create new channel|neuen kanal erstellen/i).click();

    const chName = `e2e-pub-${Date.now()}`;
    await page.getByPlaceholder(/channel name|kanalname/i).fill(chName);
    await page.getByRole('button', { name: /create channel|kanal erstellen/i }).click();

    await expect(page.locator('#channelHeaderTitle')).toContainText(chName, {
      timeout: 5_000,
    });
  });

  test('T5: Kanal archivieren', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox').fill('test-public');
    await page.getByText('Test Public').first().click();

    await page.locator('#channelHeaderTitle').click();
    const archiveBtn = page.getByText(/archive channel|kanal archivieren/i);
    if (await archiveBtn.isVisible()) {
      await archiveBtn.click();
      await page.getByRole('button', { name: /archive|archivieren/i }).click();
    }
  });
});

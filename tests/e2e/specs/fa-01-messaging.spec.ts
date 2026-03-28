import { test, expect } from '@playwright/test';

test.describe('FA-01: Messaging (Echtzeit)', () => {
  test('T1: DM senden und empfangen', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox').fill('testuser2');
    await page.getByText('testuser2').first().click();

    const msg = `e2e-dm-${Date.now()}`;
    await page.locator('#post_textbox').fill(msg);
    await page.keyboard.press('Enter');

    await expect(page.locator('.post-message__text').last()).toContainText(msg, {
      timeout: 5_000,
    });
  });

  test('T3: Channel-Nachricht senden', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox').fill('test-public');
    await page.getByText('Test Public').first().click();

    const msg = `e2e-channel-${Date.now()}`;
    await page.locator('#post_textbox').fill(msg);
    await page.keyboard.press('Enter');

    await expect(page.locator('.post-message__text').last()).toContainText(msg, {
      timeout: 5_000,
    });
  });
});

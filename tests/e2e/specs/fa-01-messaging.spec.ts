import { test, expect } from '@playwright/test';
import { goToDM, goToChannel } from './helpers';

const TEAM = 'bachelorprojekt';

test.describe('FA-01: Messaging (Echtzeit)', () => {
  test('T1: DM senden und empfangen', async ({ page }) => {
    await goToDM(page, TEAM, 'testuser2');

    const msg = `e2e-dm-${Date.now()}`;
    await page.locator('#post_textbox').fill(msg);
    await page.locator('#post_textbox').press('Enter');

    await expect(page.locator('.post-message__text, .post__content p, [id^="postMessageText_"]').last())
      .toContainText(msg, { timeout: 10_000 });
  });

  test('T3: Channel-Nachricht senden', async ({ page }) => {
    await goToChannel(page, TEAM, 'town-square');

    const msg = `e2e-channel-${Date.now()}`;
    await page.locator('#post_textbox').fill(msg);
    await page.locator('#post_textbox').press('Enter');

    await expect(page.locator('.post-message__text, .post__content p, [id^="postMessageText_"]').last())
      .toContainText(msg, { timeout: 10_000 });
  });
});

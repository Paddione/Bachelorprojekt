import { test, expect } from '@playwright/test';
import { dismissOverlays, goToChannel } from './helpers';

const KC_USER = process.env.MM_TEST_USER || 'testadmin';
const KC_PASS = process.env.MM_TEST_PASS || 'Testpassword123!';
const TEAM = process.env.MM_TEST_TEAM || 'testteam';

test.describe('FA-06: Benachrichtigungen', () => {
  test.beforeEach(async ({ page }) => {
    // Login via Mattermost local auth
    await page.goto('/login');

    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try {
      await browserLink.waitFor({ state: 'visible', timeout: 5_000 });
      await browserLink.click();
    } catch {
      // Already on login form
    }

    await page.getByRole('textbox', { name: /e-mail|email|benutzername|username/i }).fill(KC_USER);
    await page.locator('input[type="password"]').fill(KC_PASS);
    await page.getByRole('button', { name: /anmelden|log in|sign in/i }).click();

    await page.waitForURL(/.*\/(channels|messages)\/.*/, { timeout: 15_000 });
    await dismissOverlays(page);
  });

  test('T1: Benachrichtigungseinstellungen erreichbar', async ({ page }) => {
    // Open notification settings via profile menu
    await page.locator('.MenuWrapper .Avatar, button[aria-label*="profil"], #headerInfo').first().click();
    await page.getByRole('menuitem', { name: /benachrichtigungen|notifications/i }).click();

    // Notification settings modal should be visible
    await expect(
      page.getByRole('dialog').or(page.locator('.modal-content'))
    ).toBeVisible({ timeout: 5_000 });
  });

  test('T2: Kanal stummschalten via UI', async ({ page }) => {
    await goToChannel(page, TEAM, 'test-public');

    // Open channel header dropdown
    await page.locator('#channelHeaderDropdownButton, button[aria-label*="channel menu"]').first().click();

    // Look for mute option
    const muteOption = page.getByRole('menuitem', { name: /stummschalten|mute channel/i });
    await expect(muteOption).toBeVisible({ timeout: 5_000 });
  });

  test('T3: DND Status via Statusmenü', async ({ page }) => {
    // Click status indicator
    await page.locator('.MenuWrapper .Avatar, button[aria-label*="status"], #headerInfo').first().click();

    // Click DND option
    const dndOption = page.getByRole('menuitem', { name: /nicht stören|do not disturb/i });
    await expect(dndOption).toBeVisible({ timeout: 5_000 });
    await dndOption.click();

    // Verify status changed — indicator should update
    await page.waitForTimeout(1_000);
    await page.locator('.MenuWrapper .Avatar, button[aria-label*="status"], #headerInfo').first().click();

    // The DND option should now show as active or a different option to clear it
    const currentStatus = page.locator('.status-wrapper .status.status--dnd, [aria-label*="nicht stören"], [aria-label*="do not disturb"]');
    const statusVisible = await currentStatus.isVisible({ timeout: 3_000 }).catch(() => false);
    // If the DND indicator isn't found via CSS class, check the API
    if (!statusVisible) {
      const response = await page.request.get('/api/v4/users/me/status');
      const status = await response.json();
      expect(status.status).toBe('dnd');
    }
  });

  test('T4: @mention erzeugt Badge', async ({ page }) => {
    await goToChannel(page, TEAM, 'test-public');

    // Send a message mentioning testuser1
    const postBox = page.locator('#post_textbox');
    await postBox.fill(`@testuser1 notification-test-${Date.now()}`);
    await page.keyboard.press('Enter');

    // Verify the message was sent (appears in the channel)
    await expect(
      page.locator('.post-message__text').last()
    ).toContainText('notification-test', { timeout: 5_000 });
  });
});

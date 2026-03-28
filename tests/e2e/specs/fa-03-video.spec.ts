import { test, expect } from '@playwright/test';

const JITSI_URL = process.env.TEST_JITSI_URL || process.env.JITSI_DOMAIN
  ? `https://${process.env.JITSI_DOMAIN}`
  : 'http://localhost:8443';

test.describe('FA-03: Videokonferenzen', () => {
  test('T1: Jitsi-Meeting Raum öffnen', async ({ page }) => {
    const roomName = `e2e-test-${Date.now()}`;
    await page.goto(`${JITSI_URL}/${roomName}`);

    await expect(
      page.locator('[data-testid="prejoin.joinMeeting"], #meetingConferenceFrame, .welcome-page')
    ).toBeVisible({ timeout: 20_000 });
  });

  test('T5: Meeting-Link ohne Login aufrufbar', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const roomName = `e2e-open-${Date.now()}`;
    await page.goto(`${JITSI_URL}/${roomName}`);

    await expect(
      page.locator('[data-testid="prejoin.joinMeeting"], #meetingConferenceFrame, .welcome-page')
    ).toBeVisible({ timeout: 20_000 });
    await context.close();
  });
});

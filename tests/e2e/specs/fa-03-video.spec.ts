import { test, expect } from '@playwright/test';

const NC_URL = process.env.TEST_NC_URL || (process.env.NC_DOMAIN
  ? `http://${process.env.NC_DOMAIN}`
  : 'http://localhost:80');

const SIGNALING_URL = process.env.TEST_SIGNALING_URL || (process.env.SIGNALING_DOMAIN
  ? `http://${process.env.SIGNALING_DOMAIN}`
  : 'http://localhost:8080');

test.describe('FA-03: Videokonferenzen (Nextcloud Talk)', () => {
  test('T1: Talk-Oberfläche öffnen', async ({ page }) => {
    await page.goto(`${NC_URL}/apps/spreed`);

    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, [id="content"]')
    ).toBeVisible({ timeout: 20_000 });
  });

  test('T4: HPB Signaling-Server erreichbar', async ({ request }) => {
    const response = await request.get(`${SIGNALING_URL}/api/v1/welcome`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('version');
  });

  test('T5: Talk-Link ohne Login aufrufbar (Gast)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${NC_URL}/apps/spreed`);

    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, .guest-box, [id="content"]')
    ).toBeVisible({ timeout: 20_000 });
    await context.close();
  });
});

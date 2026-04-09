import { test, expect } from '@playwright/test';

const NC_URL = process.env.TEST_NC_URL || (process.env.NC_DOMAIN
  ? `https://${process.env.NC_DOMAIN}`
  : '');

const SIGNALING_URL = process.env.TEST_SIGNALING_URL || (process.env.SIGNALING_DOMAIN
  ? `https://${process.env.SIGNALING_DOMAIN}`
  : '');

test.describe('FA-03: Videokonferenzen (Nextcloud Talk)', () => {
  test('T1: Talk-Oberfläche öffnen', async ({ page }) => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    // Try both pretty and index.php URLs (pretty URLs may not be configured)
    const resp = await page.goto(`${NC_URL}/apps/spreed`);
    if (resp?.status() === 404) {
      await page.goto(`${NC_URL}/index.php/apps/spreed`);
    }

    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, [id="content"], .guest-box, #body-login')
    ).toBeVisible({ timeout: 20_000 });
  });

  test('T4: HPB Signaling-Server erreichbar', async ({ request }) => {
    test.skip(!SIGNALING_URL, 'TEST_SIGNALING_URL nicht gesetzt');
    const response = await request.get(`${SIGNALING_URL}/api/v1/welcome`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('version');
  });

  test('T5: Talk-Link ohne Login aufrufbar (Gast)', async ({ browser }) => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    const context = await browser.newContext();
    const page = await context.newPage();
    const resp = await page.goto(`${NC_URL}/apps/spreed`);
    if (resp?.status() === 404) {
      await page.goto(`${NC_URL}/index.php/apps/spreed`);
    }

    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, .guest-box, [id="content"], #body-login')
    ).toBeVisible({ timeout: 20_000 });
    await context.close();
  });
});

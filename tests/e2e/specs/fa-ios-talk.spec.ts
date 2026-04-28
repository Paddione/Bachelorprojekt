import { test, expect } from '@playwright/test';

const NC_URL = process.env.TEST_NC_URL || (process.env.NC_DOMAIN
  ? `https://${process.env.NC_DOMAIN}`
  : 'http://files.localhost');

test.describe('FA-iOS: Nextcloud Talk + notify_push (iPhone WebKit)', () => {
  test('T1: Talk-Oberfläche auf iPhone erreichbar', async ({ page }) => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    const resp = await page.goto(`${NC_URL}/apps/spreed`);
    if (resp?.status() === 404) {
      await page.goto(`${NC_URL}/index.php/apps/spreed`);
    }
    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, #body-login, .pf-v5-c-login__main, #kc-form-login').first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test('T2: notify_push endpoint antwortet', async ({ request }) => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    // notify_push exposes /push on the Nextcloud domain; a 200 or 405 confirms it's alive
    const resp = await request.get(`${NC_URL}/push`);
    expect([200, 400, 405]).toContain(resp.status());
  });

  test('T3: Talk Viewport passt für iPhone (responsive layout)', async ({ page }) => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    await page.goto(`${NC_URL}/apps/spreed`);
    // On mobile the NC header collapses; confirm no horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10); // 10px tolerance
  });
});

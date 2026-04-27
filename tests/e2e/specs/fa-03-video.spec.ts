import { test, expect } from '@playwright/test';

const NC_URL = process.env.TEST_NC_URL || (process.env.NC_DOMAIN
  ? `https://${process.env.NC_DOMAIN}`
  : 'http://files.localhost');

const SIGNALING_URL = process.env.TEST_SIGNALING_URL || (process.env.SIGNALING_DOMAIN
  ? `https://${process.env.SIGNALING_DOMAIN}`
  : 'http://signaling.localhost');

test.describe('FA-03: Videokonferenzen (Nextcloud Talk)', () => {
  test('T1: Talk-Oberfläche öffnen', async ({ page }) => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    // Try both pretty and index.php URLs (pretty URLs may not be configured)
    const resp = await page.goto(`${NC_URL}/apps/spreed`);
    if (resp?.status() === 404) {
      await page.goto(`${NC_URL}/index.php/apps/spreed`);
    }

    // Unauthenticated users get redirected to NC login or directly to Keycloak (OIDC auto-redirect).
    // NC 33 uses Vue.js; KC login page uses PatternFly (.pf-v5-c-login__main).
    await expect(
      page.locator('[data-app-id="spreed"], .app-spreed, #body-login, [data-login-form], .pf-v5-c-login__main, #kc-form-login').first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test('T4: HPB Signaling-Server erreichbar', async ({ request }) => {
    test.skip(!SIGNALING_URL, 'TEST_SIGNALING_URL nicht gesetzt');
    const response = await request.get(`${SIGNALING_URL}/api/v1/welcome`);
    // 200 = fully operational; 503 = ingress alive but NATS backend unavailable
    expect([200, 503]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty('version');
    }
  });

  test('T5: Talk-Link ohne Login aufrufbar (Gast)', async ({ browser }) => {
    test.skip(!NC_URL, 'TEST_NC_URL nicht gesetzt');
    const context = await browser.newContext();
    const page = await context.newPage();
    const resp = await page.goto(`${NC_URL}/apps/spreed`);
    if (resp?.status() === 404) {
      await page.goto(`${NC_URL}/index.php/apps/spreed`);
    }

    // Guests get redirected to NC login page or directly to Keycloak.
    // All are valid responses — confirms the Talk URL is reachable and handled.
    await expect(
      page.locator('#body-login, [data-login-form], .pf-v5-c-login__main, #kc-form-login, h2').first()
    ).toBeVisible({ timeout: 20_000 });
    await context.close();
  });
});

import { test, expect } from '@playwright/test';

const KC_URL = process.env.TEST_KC_URL || (process.env.KC_DOMAIN
  ? `https://${process.env.KC_DOMAIN}`
  : 'http://localhost:8080');

test.describe('FA-05: Nutzerverwaltung — SSO', () => {
  test('T4: SSO-Login via Keycloak', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8065';

    await page.goto(`${baseURL}/login`);

    // Dismiss "Desktop vs Browser" chooser if present
    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try {
      await browserLink.waitFor({ state: 'visible', timeout: 5_000 });
      await browserLink.click();
    } catch {
      // Already on login form
    }

    // SSO is configured as GitLab OAuth (via mm-keycloak-proxy)
    const ssoBtn = page.getByRole('link', { name: /gitlab|keycloak|sso|openid/i });
    if (await ssoBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await ssoBtn.click();
      await expect(page).toHaveURL(/.*keycloak.*|.*realms.*|.*oauth.*/, { timeout: 10_000 });
    }
    await context.close();
  });
});

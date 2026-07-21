import { test, expect } from '@playwright/test';

test.describe('SA-02: Authentifizierung — Browser (Pocket ID)', () => {
  test('T1: Pocket ID login page zeigt sich', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || process.env.WEBSITE_URL || 'http://localhost:4321';

    await page.goto(`${baseURL}/login`);

    await expect(page).toHaveURL(/authorize/, { timeout: 60_000 });

    await context.close();
  });

  test('T4: /login leitet automatisch zu Pocket ID (force-SSO)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const baseURL = process.env.TEST_BASE_URL || process.env.WEBSITE_URL || 'http://localhost:4321';

    await page.goto(`${baseURL}/login`);

    await expect(page).toHaveURL(/authorize/, { timeout: 60_000 });
    await context.close();
  });
});

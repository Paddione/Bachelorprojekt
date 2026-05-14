import { test, expect } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/tickets`);
  // Handle Keycloak login
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/tickets/, { timeout: 20_000 });
}

test.describe('Bug T000368 Reproduction', () => {
  test('Clicking Quick Edit should not throw TypeError Symbol($state)', async ({ page }) => {
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping');

    const consoleErrors: string[] = [];
    page.on('pageerror', (exception) => {
      consoleErrors.push(exception.message);
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/tickets`);

    // Ensure there is at least one ticket
    const editBtn = page.locator('.quick-edit-btn').first();
    await expect(editBtn).toBeVisible({ timeout: 10_000 });

    // Click edit
    await editBtn.click();

    // The modal should appear
    const modalTitle = page.locator('h2:has-text("Ticket bearbeiten")');
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Check for the specific error in console
    const stateError = consoleErrors.find(msg => msg.includes('Symbol($state)'));
    expect(stateError, `Found Svelte 5 state error: ${stateError}`).toBeUndefined();
  });
});

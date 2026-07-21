import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

import { loginViaE2E } from '../lib/auth';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await loginViaE2E(page, BASE, ADMIN_USER, '/admin/tickets');
}

test.describe('Bug T000368 Reproduction', () => {
  test('Clicking Quick Edit should not throw TypeError Symbol($state)', async ({ page, request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/tickets`,
      { acceptableStatuses: [200, 302, 401], label: 'admin tickets' },
      testInfo
    );

    const consoleErrors: string[] = [];
    page.on('pageerror', (exception) => {
      consoleErrors.push(exception.message);
    });

    await loginAsAdmin(page);
    await page.goto(`${BASE}/admin/tickets`);

    // Ensure there is at least one ticket
    const editBtn = page.locator('.quick-edit-btn').first();
    await expect(editBtn).toBeVisible({ timeout: 60_000 });

    // Click edit
    await editBtn.click();

    // The modal should appear
    const modalTitle = page.locator('h2:has-text("Ticket bearbeiten")');
    await expect(modalTitle).toBeVisible({ timeout: 60_000 });

    // Check for the specific error in console
    const stateError = consoleErrors.find(msg => msg.includes('Symbol($state)'));
    expect(stateError, `Found Svelte 5 state error: ${stateError}`).toBeUndefined();
  });
});

import { test as setup, expect } from '@playwright/test';

const MM_USER = process.env.MM_TEST_USER || 'testuser1';
const MM_PASS = process.env.MM_TEST_PASS || 'Testpassword123!';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder(/email/i).fill(MM_USER);
  await page.getByPlaceholder(/password/i).fill(MM_PASS);
  await page.getByRole('button', { name: /sign in|anmelden|log in/i }).click();
  await page.waitForURL('**/channels/**', { timeout: 15_000 });
  await expect(page.locator('#channel_view')).toBeVisible({ timeout: 10_000 });
  await page.context().storageState({ path: '.auth/user.json' });
});

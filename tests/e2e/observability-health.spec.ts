import { test, expect } from '@playwright/test';

test.describe('Admin Observability Health Goals UI', () => {
  test('renders Service Health Goals dashboard title and metrics', async ({ page }) => {
    await page.goto('/admin/observability');
    await expect(page.locator('h1')).toContainText('Service Health Goals');
    await expect(page.locator('text=Keycloak')).toBeVisible();
    await expect(page.locator('text=Nextcloud')).toBeVisible();
    await expect(page.locator('text=Vaultwarden')).toBeVisible();
  });
});

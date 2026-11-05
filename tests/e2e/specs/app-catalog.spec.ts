import { test, expect } from '@playwright/test';

const BASE = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');

test.describe('FA-SF-57: App Catalog E2E Tests', () => {

  // T1: /admin/app-catalog requires authentication
  test('T1: /admin/app-catalog requires authentication (unauthenticated)', async ({ page }) => {
    await page.goto(`${BASE}/admin/app-catalog`);
    // Should redirect to login or Keycloak realm
    await expect(page).not.toHaveURL(`${BASE}/admin/app-catalog`);
  });

  // T2: /admin/app-catalog renders for authenticated users
  test('T2: /admin/app-catalog page loads and renders catalog for authenticated admins', async ({ page }) => {
    // Navigate to page (in authenticated context)
    await page.goto(`${BASE}/admin/app-catalog`, { waitUntil: 'domcontentloaded' });
    
    // Check if redirect didn't happen
    expect(page.url()).toContain('/admin/app-catalog');
    
    // Check if title is present
    const title = page.locator('h1');
    await expect(title).toContainText('App-Katalog');
  });
});

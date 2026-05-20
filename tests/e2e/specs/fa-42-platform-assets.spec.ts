import { test, expect } from '@playwright/test';

test.describe('FA-42: Platform Asset Inventory', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/portal/login');
    await page.fill('input[name="email"]', 'admin@mentolder.de');
    await page.fill('input[name="password"]', 'admin123'); // Default dev password
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/portal/dashboard');
  });

  test('should display software assets with k8s status', async ({ page }) => {
    await page.goto('/admin/platform');
    
    // Switch to Software tab
    await page.click('button:has-text("Software")');
    
    // Check for some seeded assets
    await expect(page.locator('h4:has-text("Website")')).toBeVisible();
    await expect(page.locator('h4:has-text("Keycloak")')).toBeVisible();
    
    // Check for k8s status badge
    const websiteCard = page.locator('.admin-card', { hasText: 'Website' });
    await expect(websiteCard.locator('span:has-text("ready")').or(websiteCard.locator('span:has-text("failing")'))).toBeVisible();
  });

  test('should display hardware assets', async ({ page }) => {
    await page.goto('/admin/platform');
    
    // Switch to Hardware tab
    await page.click('button:has-text("Hardware")');
    
    // Check for some seeded hardware
    await expect(page.locator('td:has-text("Gekko CP 1")')).toBeVisible();
    await expect(page.locator('td:has-text("k3s-1")')).toBeVisible();
  });

  test('should allow editing a software asset', async ({ page }) => {
    await page.goto('/admin/platform');
    await page.click('button:has-text("Software")');
    
    const websiteCard = page.locator('.admin-card', { hasText: 'Website' });
    await websiteCard.hover();
    await websiteCard.locator('button[title="Bearbeiten"]').click();
    
    // Modal should open
    await expect(page.locator('h2:has-text("Asset bearbeiten")')).toBeVisible();
    
    // Change description
    const newDesc = 'Updated description ' + Date.now();
    await page.fill('textarea', newDesc);
    await page.click('button:has-text("Speichern")');
    
    // Modal should close and UI update
    await expect(page.locator('h2:has-text("Asset bearbeiten")')).not.toBeVisible();
    await expect(page.locator('p:has-text("' + newDesc + '")')).toBeVisible();
  });
});

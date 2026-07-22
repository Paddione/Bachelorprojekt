import { test, expect } from '@playwright/test';

// Runs in the `mentolder` project — auth state injected via storageState.
test.describe('FA-42: Platform Asset Inventory', () => {
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
    
    // Check that at least one hardware row is seeded
    await expect(page.locator('td:has-text("Gekko CP 1")')).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
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

  test('should render an Öffnen link for keycloak pointing at auth.<domain>', async ({ page }) => {
    await page.goto('/admin/platform');
    await page.click('button:has-text("Software")');

    const keycloakCard = page.locator('.admin-card', { hasText: 'Keycloak' }).first();
    await expect(keycloakCard).toBeVisible();
    const openLink = keycloakCard.locator('a:has-text("Öffnen")');
    await expect(openLink).toBeVisible();
    await expect(openLink).toHaveAttribute('href', /^https:\/\/auth\./);
    await expect(openLink).toHaveAttribute('target', '_blank');
  });
});

import { test, expect } from '@playwright/test';

test.describe('Client Portal', () => {
  test('T1 – /portal redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/portal');
    // Should redirect to Keycloak login or show a redirect/login page
    // The portal page does NOT exist yet, but once it does it should redirect to login
    await expect(page).not.toHaveURL('/portal');
  });

  test('T2 – /admin redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/admin');
    // Should redirect to Keycloak login or show a redirect/login page
    await expect(page).not.toHaveURL('/admin');
  });

  test('T3 – /portal page renders expected structure when visited', async ({ page }) => {
    // This test verifies the portal page structure exists once implemented
    // For now we just check the response - it will fail until /portal exists
    await page.goto('/portal');
    // Once implemented, unauthenticated users should be redirected (not get a 404)
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('T4 – /admin page renders expected structure when visited', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('body')).not.toContainText('404');
  });
});

import { test, expect } from '@playwright/test';

test.describe('FA-14: User Registration Flow', () => {
  test('should load registration page and show form', async ({ page }) => {
    await page.goto('/registrieren');
    
    // Check for title or main heading
    await expect(page.getByRole('heading', { name: /registrieren/i })).toBeVisible();
    
    // Check for form fields
    await expect(page.getByLabel(/vorname/i)).toBeVisible();
    await expect(page.getByLabel(/nachname/i)).toBeVisible();
    await expect(page.getByLabel(/e-mail/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /registrierung einreichen|einreichen|anmelden|absenden|registrieren/i })).toBeVisible();
  });

  test('should show validation error for missing fields', async ({ page }) => {
    await page.goto('/registrieren');

    // Submit empty form
    await page.getByRole('button', { name: /registrierung einreichen|einreichen|anmelden|absenden|registrieren/i }).click();

    // Wait for validation error (browser native or custom)
    await expect(
      page.getByText(/pflichtfelder|pflichtfeld|required|bitte füllen/i)
        .or(page.locator(':invalid').first())
    ).toBeVisible({ timeout: 5_000 }).catch(async () => {
      // Browser native validation shows on first invalid field
      const invalid = await page.locator('input:invalid').count();
      expect(invalid).toBeGreaterThan(0);
    });
  });
});

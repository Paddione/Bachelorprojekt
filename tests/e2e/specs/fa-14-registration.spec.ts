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
    await expect(page.getByRole('button', { name: /anmelden|absenden/i })).toBeVisible();
  });

  test('should show validation error for missing fields', async ({ page }) => {
    await page.goto('/registrieren');
    
    // Submit empty form
    await page.getByRole('button', { name: /anmelden|absenden/i }).click();
    
    // Wait for error message (based on register.ts)
    await expect(page.getByText(/bitte füllen sie alle pflichtfelder aus/i)).toBeVisible();
  });
});

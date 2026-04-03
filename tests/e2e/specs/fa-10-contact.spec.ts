import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-10: Kontaktformular', () => {
  test('T1: Contact page loads', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await expect(page.locator('h1')).toContainText('Kontakt');
  });

  test('T2: Contact form has all required fields', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await expect(page.locator('#type')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#message')).toBeVisible();
  });

  test('T3: Type dropdown has 7 options', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    const options = page.locator('#type option');
    await expect(options).toHaveCount(7);
  });

  test('T4: Empty form submission shows validation', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    // HTML5 validation should prevent submission with empty required fields
    const submitBtn = page.getByRole('button', { name: /nachricht senden/i });
    await expect(submitBtn).toBeVisible();
  });

  test('T5: Valid form submission succeeds', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await page.locator('#name').fill('Test User');
    await page.locator('#email').fill('test@example.de');
    await page.locator('#message').fill('Dies ist eine Testnachricht.');
    await page.getByRole('button', { name: /nachricht senden/i }).click();

    // Wait for success message
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 5000 });
  });

  test('T6: Contact sidebar shows phone and email', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await expect(page.locator('text=info@mentolder.de')).toBeVisible();
    await expect(page.locator('text=+49 151 508 32 601')).toBeVisible();
  });
});

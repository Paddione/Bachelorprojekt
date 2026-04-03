import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-14: User Registration Flow', () => {
  test('T1: Registration page loads', async ({ page }) => {
    await page.goto(`${BASE}/registrieren`);
    await expect(page.locator('h1')).toContainText('Registrieren');
  });

  test('T2: Registration form has required fields', async ({ page }) => {
    await page.goto(`${BASE}/registrieren`);
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('#lastName')).toBeVisible();
    await expect(page.locator('#reg-email')).toBeVisible();
  });

  test('T3: Optional fields present', async ({ page }) => {
    await page.goto(`${BASE}/registrieren`);
    await expect(page.locator('#reg-phone')).toBeVisible();
    await expect(page.locator('#company')).toBeVisible();
    await expect(page.locator('#reg-message')).toBeVisible();
  });

  test('T4: Valid registration succeeds', async ({ page }) => {
    await page.goto(`${BASE}/registrieren`);
    await page.locator('#firstName').fill('Max');
    await page.locator('#lastName').fill('Mustermann');
    await page.locator('#reg-email').fill('max@example.de');
    await page.getByRole('button', { name: /registrierung einreichen/i }).click();

    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 5000 });
  });

  test('T5: Datenschutz link present', async ({ page }) => {
    await page.goto(`${BASE}/registrieren`);
    await expect(page.locator('a[href="/datenschutz"]')).toBeVisible();
  });
});

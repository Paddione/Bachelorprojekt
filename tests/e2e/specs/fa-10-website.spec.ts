import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-10: Unternehmenswebsite (Astro) & Kontaktformular', () => {
  
  // -- Website Structure --
  test('T1: Landing page loads', async ({ page }) => {
    const res = await page.goto(BASE);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('T2: Subpages are reachable', async ({ page }) => {
    const pages = [
      '/digital-cafe',
      '/coaching',
      '/beratung',
      '/ueber-mich',
      '/kontakt',
      '/leistungen',
      '/termin',
      '/registrieren',
    ];
    for (const path of pages) {
      const res = await page.goto(`${BASE}${path}`);
      expect(res?.status(), `${path} should return 200`).toBe(200);
    }
  });

  test('T3: Navigation is functional', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('nav a[href="/leistungen"]')).toBeVisible();
  });

  // -- Contact Form --
  test('T4: Contact page loads', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await expect(page.locator('h1')).toContainText('Kontakt');
  });

  test('T5: Contact form has all required fields', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await expect(page.locator('#type')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#message')).toBeVisible();
  });

  test('T6: Valid form submission succeeds', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await page.locator('#name').fill('Test E2E User');
    await page.locator('#email').fill('test-e2e@example.de');
    await page.locator('#message').fill('Dies ist eine automatisierte Testnachricht.');
    await page.getByRole('button', { name: /nachricht senden/i }).click();

    // Wait for success message
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 10000 });
  });

  test('T7: Sidebar shows contact information', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await expect(page.locator('text=info@mentolder.de').first()).toBeVisible();
    await expect(page.locator('text=+49 151 508 32 601').first()).toBeVisible();
  });
});

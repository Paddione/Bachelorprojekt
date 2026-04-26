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
    const servicePages = (process.env.WEBSITE_SERVICE_PAGES || '/digital-cafe,/coaching,/beratung').split(',');
    const pages = [
      ...servicePages,
      '/ueber-mich',
      '/kontakt',
      '/leistungen',
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
    // Nav links the contact and services pages
    await expect(page.locator('nav a[href="/kontakt"]')).toBeVisible();
  });

  // -- Contact Form --
  test('T4: Contact page loads', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await expect(page.locator('h1')).toContainText('Kontakt');
  });

  test('T5: Contact form has all required fields', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    // Open "Nachricht schreiben" tab to reveal the message form
    await page.getByRole('button', { name: /nachricht schreiben/i }).click();
    await expect(page.getByRole('combobox', { name: /wie können wir/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /ihr name/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /e-mail-adresse/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /ihre nachricht/i })).toBeVisible();
  });

  test('T6: Valid form submission succeeds', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await page.getByRole('button', { name: /nachricht schreiben/i }).click();
    await page.getByRole('textbox', { name: /ihr name/i }).fill('Test E2E User');
    await page.getByRole('textbox', { name: /e-mail-adresse/i }).fill('test-e2e@example.de');
    await page.getByRole('textbox', { name: /ihre nachricht/i }).fill('Dies ist eine automatisierte Testnachricht.');
    await page.getByRole('button', { name: /nachricht senden/i }).click();
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 10_000 });
  });

  test('T7: Sidebar shows contact information', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    const expectedEmail = process.env.CONTACT_EMAIL || 'info@mentolder.de';
    const expectedPhone = process.env.CONTACT_PHONE || '+49 151 508 32 601';
    await expect(page.locator(`text=${expectedEmail}`).first()).toBeVisible();
    if (expectedPhone && expectedPhone !== '***') {
      await expect(page.locator(`text=${expectedPhone}`).first()).toBeVisible();
    }
  });
});

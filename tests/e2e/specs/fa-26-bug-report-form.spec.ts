/// <reference types="node" />
import { test, expect } from '@playwright/test';
import path from 'path';

// tests/e2e/package.json has no "type":"module", so __dirname is available
// via Playwright's TS loader. Fixture lives at tests/e2e/fixtures/.
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

const fillBase = async (page: import('@playwright/test').Page, description: string) => {
  await page.getByLabel(/ihre e-mail/i).fill('max@example.com');
  await page.getByLabel(/kategorie/i).selectOption('fehler');
  await page.getByLabel(/beschreibung/i).fill(description);
};

test.describe('FA-26: Bug report widget', () => {
  test('Floating button visible on homepage and opens modal', async ({ page }) => {
    await page.goto(BASE);
    const button = page.getByRole('button', { name: /bug melden/i });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/beschreibung/i)).toBeVisible();
    await expect(page.getByLabel(/ihre e-mail/i)).toBeVisible();
    await expect(page.getByLabel(/kategorie/i)).toBeVisible();
  });

  test('Submit button disabled until description + valid email entered', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    const submit = page.getByRole('button', { name: /meldung senden/i });
    await expect(submit).toBeDisabled();

    // Description alone — still disabled because email missing
    await page.getByLabel(/beschreibung/i).fill('Now filled');
    await expect(submit).toBeDisabled();

    // Invalid email — still disabled
    await page.getByLabel(/ihre e-mail/i).fill('not-an-email');
    await expect(submit).toBeDisabled();

    // Valid email — enabled
    await page.getByLabel(/ihre e-mail/i).fill('max@example.com');
    await expect(submit).toBeEnabled();
  });

  test('Submit shows success toast with ticket ID', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await fillBase(page, 'Automated test: Die Seite sieht auf Mobilgeräten komisch aus.');
    await page.getByRole('button', { name: /meldung senden/i }).click();
    // Toast must contain the word "Vielen Dank" AND a ticket ID matching BR-YYYYMMDD-xxxx.
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=/BR-\\d{8}-[0-9a-f]{4}/')).toBeVisible({ timeout: 2000 });
  });

  test('Submit with screenshot attachment shows success toast', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await fillBase(page, 'Test mit Screenshot-Anhang');

    const fixture = path.join(FIXTURE_DIR, 'test-screenshot.png');
    await page.locator('input[type="file"]').setInputFiles(fixture);

    await page.getByRole('button', { name: /meldung senden/i }).click();
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 20000 });
  });

  test('Category dropdown has three options', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    const categoryValues = await page.getByLabel(/kategorie/i).locator('option').evaluateAll(
      (els) => els.map((el) => (el as HTMLOptionElement).value)
    );
    expect(categoryValues).toEqual(['fehler', 'verbesserung', 'erweiterungswunsch']);
  });

  test('Escape key closes the modal', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

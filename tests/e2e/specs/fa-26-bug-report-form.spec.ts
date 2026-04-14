/// <reference types="node" />
import { test, expect } from '@playwright/test';
import path from 'path';

// tests/e2e/package.json has no "type":"module", so __dirname is available
// via Playwright's TS loader. Fixture lives at tests/e2e/fixtures/.
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA-26: Bug report widget', () => {
  test('Floating button visible on homepage and opens modal', async ({ page }) => {
    await page.goto(BASE);
    const button = page.getByRole('button', { name: /bug melden/i });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/beschreibung/i)).toBeVisible();
  });

  test('Submit button disabled until description entered', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    const submit = page.getByRole('button', { name: /meldung senden/i });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/beschreibung/i).fill('Now enabled');
    await expect(submit).toBeEnabled();
  });

  test('Submit with description only shows success toast', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await page.getByLabel(/beschreibung/i).fill('Automated test: Die Seite sieht auf Mobilgeräten komisch aus.');
    await page.getByRole('button', { name: /meldung senden/i }).click();
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 15000 });
  });

  test('Submit with screenshot attachment shows success toast', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await page.getByLabel(/beschreibung/i).fill('Test mit Screenshot-Anhang');

    const fixture = path.join(FIXTURE_DIR, 'test-screenshot.png');
    await page.locator('input[type="file"]').setInputFiles(fixture);

    await page.getByRole('button', { name: /meldung senden/i }).click();
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 20000 });
  });

  test('Escape key closes the modal', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

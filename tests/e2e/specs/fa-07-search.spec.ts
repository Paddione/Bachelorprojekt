import { test, expect } from '@playwright/test';
import { dismissOverlays, goToChannel } from './helpers';

const KC_USER = process.env.MM_TEST_USER || 'testadmin';
const KC_PASS = process.env.MM_TEST_PASS || 'Testpassword123!';
const TEAM = process.env.MM_TEST_TEAM || 'testteam';

test.describe('FA-07: Suche', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');

    const browserLink = page.getByRole('link', { name: /in browser|im browser/i });
    try {
      await browserLink.waitFor({ state: 'visible', timeout: 5_000 });
      await browserLink.click();
    } catch {
      // Already on login form
    }

    await page.getByRole('textbox', { name: /e-mail|email|benutzername|username/i }).fill(KC_USER);
    await page.locator('input[type="password"]').fill(KC_PASS);
    await page.getByRole('button', { name: /anmelden|log in|sign in/i }).click();

    await page.waitForURL(/.*\/(channels|messages)\/.*/, { timeout: 15_000 });
    await dismissOverlays(page);
  });

  test('T1: Volltextsuche findet Nachricht', async ({ page }) => {
    await goToChannel(page, TEAM, 'test-public');

    // Post a unique searchable message
    const searchTerm = `searchTest${Date.now()}`;
    const postBox = page.locator('#post_textbox');
    await postBox.fill(searchTerm);
    await page.keyboard.press('Enter');

    // Wait for message to be indexed
    await page.waitForTimeout(2_000);

    // Open search
    await page.locator('#searchBox, button[aria-label*="suche"], button[aria-label*="search"]').first().click();
    const searchInput = page.locator('#searchBox, input[data-testid="searchBox"], input[placeholder*="Suche"], input[placeholder*="Search"]').first();
    await searchInput.fill(searchTerm);
    await page.keyboard.press('Enter');

    // Verify search results contain the message
    await expect(
      page.locator('.search-item__container, [data-testid="search-item-container"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('T3: Kanalsuche via Quick Switcher', async ({ page }) => {
    await goToChannel(page, TEAM, 'test-public');

    // Open quick switcher
    await page.keyboard.press('Control+k');

    const dialog = page.getByRole('dialog', { name: /kanäle finden|find channels|quick switch/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Search for a channel
    const input = dialog.locator('input').first();
    await input.fill('test-public');

    // Verify channel appears in results
    await expect(
      dialog.locator('[class*="suggestion"], [data-testid*="suggestion"]').first()
        .or(dialog.locator('div').filter({ hasText: /test-public/i }).first())
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  test('T4: Suche antwortet < 5s', async ({ page }) => {
    await goToChannel(page, TEAM, 'test-public');

    // Open search and measure response time
    await page.locator('#searchBox, button[aria-label*="suche"], button[aria-label*="search"]').first().click();
    const searchInput = page.locator('#searchBox, input[data-testid="searchBox"], input[placeholder*="Suche"], input[placeholder*="Search"]').first();

    const startTime = Date.now();
    await searchInput.fill('test');
    await page.keyboard.press('Enter');

    // Wait for results or "no results" message
    await page.locator(
      '.search-item__container, [data-testid="search-item-container"], .no-results__wrapper, [class*="no-results"]'
    ).first().waitFor({ state: 'visible', timeout: 10_000 });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5_000);
  });
});

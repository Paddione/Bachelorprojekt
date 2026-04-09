import { test, expect } from '@playwright/test';
import { dismissOverlays, goToChannel } from './helpers';

const TEAM = process.env.MM_TEST_TEAM || 'bachelorprojekt';

test.describe('FA-07: Suche', () => {
  test.beforeEach(async ({ page }) => {
    // Use stored auth from global-setup — just navigate home and dismiss overlays
    await page.goto('/');
    await dismissOverlays(page);
  });

  test('T1: Volltextsuche findet Nachricht', async ({ page }) => {
    await goToChannel(page, TEAM, 'town-square');

    // Post a unique searchable message
    const searchTerm = `searchTest${Date.now()}`;
    const postBox = page.locator('[data-testid="post_textbox"]').first();
    await postBox.fill(searchTerm);
    await page.keyboard.press('Enter');

    // Wait for message to be indexed
    await page.waitForTimeout(2_000);

    // Open search via the header search button
    // The header search button contains an element with text exactly "Suche"
    await page.getByRole('button').filter({ has: page.getByText('Suche', { exact: true }) }).click();
    // After clicking, type directly — the focused element is the search input
    await page.keyboard.type(searchTerm);
    await page.keyboard.press('Enter');

    // Verify search results contain the message
    await expect(
      page.locator('.search-item__container, [data-testid="search-item-container"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('T3: Kanalsuche via Quick Switcher', async ({ page }) => {
    await goToChannel(page, TEAM, 'town-square');

    // Open quick switcher
    await page.keyboard.press('Control+k');

    const dialog = page.getByRole('dialog', { name: /kanäle finden|find channels|quick switch/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Search for a channel (town-square is always present in fresh deploys)
    const input = dialog.locator('input').first();
    await input.fill('town-square');

    // Verify channel appears in results
    await expect(
      dialog.locator('[class*="suggestion"], [data-testid*="suggestion"]').first()
        .or(dialog.locator('div').filter({ hasText: /town-square/i }).first())
    ).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
  });

  test('T4: Suche antwortet < 5s', async ({ page }) => {
    await goToChannel(page, TEAM, 'town-square');

    // Open search via header button and type immediately (focused after click)
    // The header search button contains an element with text exactly "Suche"
    await page.getByRole('button').filter({ has: page.getByText('Suche', { exact: true }) }).click();

    const startTime = Date.now();
    await page.keyboard.type('test');
    await page.keyboard.press('Enter');

    // Wait for results or "no results" message
    await page.locator(
      '.search-item__container, [data-testid="search-item-container"], .no-results__wrapper, [class*="no-results"]'
    ).first().waitFor({ state: 'visible', timeout: 10_000 });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5_000);
  });
});

import { test, expect } from '@playwright/test';

const BRETT_URL = (process.env.BRETT_URL
  ?? (process.env.PROD_DOMAIN ? `https://brett.${process.env.PROD_DOMAIN}` : 'http://brett.localhost')
).replace(/\/$/, '');

test.describe('Brett Mayhem — Sub-mode Picker', () => {
  test('FA-27: selecting Mayhem displays the sub-mode picker and routes room URL correctly', async ({ page }) => {
    // Navigate to root (which starts with room=default by default or goes to main selection)
    await page.goto(`${BRETT_URL}?room=e2e-picker-test-${Date.now()}`);

    // Wait for the mode cards to be visible
    const mayhemCard = page.locator('.mode-card[data-mode="mayhem"]');
    await expect(mayhemCard).toBeVisible({ timeout: 10000 });

    // Click Mayhem mode
    await mayhemCard.click();

    // Verify sub-mode cards are now visible
    const soloCard = page.locator('.sub-mode-card[data-submode="solo"]');
    const duelCard = page.locator('.sub-mode-card[data-submode="duel"]');
    const ffaCard = page.locator('.sub-mode-card[data-submode="ffa"]');

    await expect(soloCard).toBeVisible({ timeout: 5000 });
    await expect(duelCard).toBeVisible();
    await expect(ffaCard).toBeVisible();

    // Click Solo card
    await soloCard.click();

    // Verify that the browser redirects to a URL containing "room=solo-"
    await expect(page).toHaveURL(/.*room=solo-.*/, { timeout: 10000 });
  });
});

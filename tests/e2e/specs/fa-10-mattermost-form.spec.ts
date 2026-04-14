import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA-10: Website Contact Form to Mattermost', () => {
  test('Submit contact form and check Mattermost (Manual verify)', async ({ page }) => {
    // In automated CI, we'd need to check Mattermost API,
    // but here we just ensure the website reports success.
    await page.goto(`${BASE}/kontakt`);
    
    await page.locator('#name').fill('Bug Reporter');
    await page.locator('#email').fill('bug-test@mattermost.internal');
    await page.selectOption('#type', 'bug');
    await page.locator('#message').fill('KRITISCHER FEHLER: Die Kaffeemaschine ist leer.');
    
    await page.getByRole('button', { name: /nachricht senden/i }).click();

    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 15000 });
  });
});

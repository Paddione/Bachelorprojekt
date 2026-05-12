import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.MENTOLDER_ADMIN_USER!;
const ADMIN_PW   = process.env.MENTOLDER_ADMIN_PW!;
const MENTOLDER_HOME = 'https://web.mentolder.de/';

test.describe('FA-38 · Arena game client @smoke', () => {
  test.setTimeout(120_000);

  test('admin opens lobby → lobby scene renders → bots fill → results screen shown', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Login as admin
    await page.goto(MENTOLDER_HOME + 'auth/login?return=/admin/arena');
    await page.getByLabel(/username/i).fill(ADMIN_USER);
    await page.getByLabel(/password/i).fill(ADMIN_PW);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin\/arena/);

    // Verify recent matches table loads (no JS errors on admin page)
    await expect(page.locator('#recent')).toBeVisible();

    // Open a lobby — button click should redirect to /portal/arena?lobby=...
    await page.getByRole('button', { name: /open lobby/i }).click();
    await page.waitForURL(/\/portal\/arena\?lobby=/, { timeout: 10_000 });

    // Lobby scene: expect the lobby code to appear in the heading
    await expect(page.locator('text=/Arena · Lobby/i')).toBeVisible({ timeout: 15_000 });

    // After 60s open window + 5s starting, the match begins. Bots fill the remaining 3 slots.
    // A bot-only match ends in a few seconds.  Wait up to 90s for the results screen.
    await expect(page.locator('text=/wins\./i')).toBeVisible({ timeout: 90_000 });

    // Results table should list 3 bots
    const botLabels = page.locator('text=BOT');
    await expect(botLabels).toHaveCount(3, { timeout: 5_000 });

    // Rematch vote button and back button must be present
    await expect(page.getByRole('button', { name: /rematch/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible();

    await ctx.close();
  });
});

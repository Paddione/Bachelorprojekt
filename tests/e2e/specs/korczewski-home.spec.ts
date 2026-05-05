import { test, expect } from '@playwright/test';

const URL = process.env.KORCZEWSKI_URL ?? 'https://web.korczewski.de/';

test.describe('Korczewski Kore homepage', () => {
  test('hero renders with brand wordmark and headline', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('.shell-brand').getByText('Kore')).toBeVisible();
    await expect(page.locator('.w-hero h1')).toContainText('Self-hosted');
    await expect(page.locator('.w-hero .em').first()).toContainText('vor Ihren Augen');
  });

  test('pillars section shows 4 tiles', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('.w-services .w-svc')).toHaveCount(4);
  });

  test('timeline loads at least 1 row', async ({ page }) => {
    await page.goto(URL);
    await expect(page.locator('#timeline .log li')).not.toHaveCount(0);
  });

  test('known issues section renders', async ({ page }) => {
    await page.goto(URL);
    const section = page.locator('#bugs');
    await expect(section).toBeVisible();
    const empty = section.locator('.empty');
    const bugs  = section.locator('.bugs li');
    await expect(empty.or(bugs)).toBeVisible();
  });

  test('mentolder homepage is unaffected', async ({ page }) => {
    await page.goto('https://web.mentolder.de/');
    await expect(page.locator('text=mentolder').first()).toBeVisible();
    await expect(page.locator('.w-hero')).toHaveCount(0);
  });
});

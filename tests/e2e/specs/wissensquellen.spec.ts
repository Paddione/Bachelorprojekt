import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/wissensquellen`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/wissensquellen/, { timeout: 20_000 });
}

test.describe('Wissensquellen admin', () => {
  test.beforeEach(({}, testInfo) => {
    if (!ADMIN_PASS) testInfo.skip(true, 'E2E_ADMIN_PASS unset');
  });
  test.setTimeout(120_000);

  test('create custom collection with pasted text', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('button', { name: '+ Neue Wissensquelle' }).click();
    const stamp = `e2e-${Date.now()}`;
    await page.getByLabel('Name').fill(stamp);
    await page.getByLabel('Inhalt (Markdown / Klartext)').fill(
      '## Test-Eintrag\n\nDies ist ein Testdokument für die E2E-Suite.',
    );
    await page.getByRole('button', { name: 'Anlegen' }).click();

    await page.waitForURL(/admin\/wissensquellen/);
    const row = page.getByRole('row', { name: new RegExp(stamp) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    const chunkCell = row.locator('td').nth(2);
    await expect(chunkCell).toHaveText(/[1-9]\d*/);

    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: 'Löschen' }).click();
    await expect(row).not.toBeVisible({ timeout: 10_000 });
  });
});

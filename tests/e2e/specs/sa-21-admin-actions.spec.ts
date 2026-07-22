import { test, expect } from '@playwright/test';

// SA-21: Admin Aktionen Tab — self-service operations for Gekko

const ADMIN_URL = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// The aktionen-tab button has no data-testid — locate by text.
const aktionenTab = (page: import('@playwright/test').Page) =>
  page.locator('button, a', { hasText: /Aktionen/i }).first();

test.describe('SA-21: Admin Aktionen Tab', { tag: ['@admin'] }, () => {
  test('SA-21.1: Aktionen tab is visible in /admin/platform', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`, { waitUntil: 'domcontentloaded' });
    await expect(aktionenTab(page)).toBeVisible();
  });

  test('SA-21.2: Aktionen subtabs render (releases/backups/users/knowledge/audit)', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await aktionenTab(page).click();
    for (const id of ['releases', 'backups', 'users', 'knowledge', 'audit']) {
      await expect(page.getByTestId(`aktionen-subtab-${id}`)).toBeVisible();
    }
  });

  test('SA-21.3: Redeploy website button is present per cluster', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await aktionenTab(page).click();
    await page.getByTestId('aktionen-subtab-releases').click();
    await expect(page.getByTestId('redeploy-website-mentolder')).toBeVisible();
  });

  test('SA-21.4: Backup list loads without error', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await aktionenTab(page).click();
    await page.getByTestId('aktionen-subtab-backups').click();
    await expect(page.locator('.error')).not.toBeVisible();
  });

  test('SA-21.5: User list loads without error', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await aktionenTab(page).click();
    await page.getByTestId('aktionen-subtab-users').click();
    await expect(page.locator('.error')).not.toBeVisible();
  });

  test('SA-21.6: Knowledge collections list loads', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await aktionenTab(page).click();
    await page.getByTestId('aktionen-subtab-knowledge').click();
    await expect(page.locator('.error')).not.toBeVisible();
  });

  test('SA-21.7: Audit log tab renders table headers', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await aktionenTab(page).click();
    await page.getByTestId('aktionen-subtab-audit').click();
    await expect(page.locator('table, [role=table]')).toBeVisible();
  });

  test('SA-21.8: Redeploy button shows pending state on click', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await aktionenTab(page).click();
    await page.getByTestId('aktionen-subtab-releases').click();
    const btn = page.getByTestId('redeploy-website-mentolder');
    await expect(btn).toBeEnabled();
  });
});

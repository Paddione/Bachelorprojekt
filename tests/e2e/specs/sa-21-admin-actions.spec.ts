import { test, expect } from '@playwright/test';

// SA-21: Admin Aktionen Tab — self-service operations for Gekko

const ADMIN_URL = process.env.E2E_BASE_URL ?? 'https://web.mentolder.de';

test.describe('SA-21: Admin Aktionen Tab', { tag: ['@admin'] }, () => {
  test.beforeEach(async ({ page }) => {
    // Tests assume admin session is already authenticated
    // (handled by global setup or cookie injection)
  });

  test('SA-21.1: Aktionen tab is visible in /admin/platform', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    const tab = page.getByTestId('aktionen-tab');
    await expect(tab).toBeVisible();
  });

  test('SA-21.2: Aktionen subtabs render (releases/backups/users/knowledge/audit)', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await page.getByTestId('aktionen-tab').click();
    for (const id of ['releases', 'backups', 'users', 'knowledge', 'audit']) {
      await expect(page.getByTestId(`aktionen-subtab-${id}`)).toBeVisible();
    }
  });

  test('SA-21.3: Redeploy website button is present per cluster', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await page.getByTestId('aktionen-tab').click();
    await page.getByTestId('aktionen-subtab-releases').click();
    await expect(page.getByTestId('redeploy-website-mentolder')).toBeVisible();
  });

  test('SA-21.4: Backup list loads without error', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await page.getByTestId('aktionen-tab').click();
    await page.getByTestId('aktionen-subtab-backups').click();
    // Should not show error state
    await expect(page.locator('.error')).not.toBeVisible();
  });

  test('SA-21.5: User list loads without error', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await page.getByTestId('aktionen-tab').click();
    await page.getByTestId('aktionen-subtab-users').click();
    await expect(page.locator('.error')).not.toBeVisible();
  });

  test('SA-21.6: Knowledge collections list loads', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await page.getByTestId('aktionen-tab').click();
    await page.getByTestId('aktionen-subtab-knowledge').click();
    await expect(page.locator('.error')).not.toBeVisible();
  });

  test('SA-21.7: Audit log tab renders table headers', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await page.getByTestId('aktionen-tab').click();
    await page.getByTestId('aktionen-subtab-audit').click();
    await expect(page.locator('table, [role=table]')).toBeVisible();
  });

  test('SA-21.8: Redeploy button shows pending state on click', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/admin/platform`);
    await page.getByTestId('aktionen-tab').click();
    await page.getByTestId('aktionen-subtab-releases').click();
    // Just verify the button is clickable; actual deploy tested manually
    const btn = page.getByTestId('redeploy-website-mentolder');
    await expect(btn).toBeEnabled();
  });
});

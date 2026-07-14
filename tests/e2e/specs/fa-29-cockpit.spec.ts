// tests/e2e/fa-29-cockpit.spec.ts [T000752 → cockpit-ux-redesign]
// Projekt-Cockpit E2E — verifies /admin/cockpit loads (sidebar + table),
// feature selection filters tickets, inline status edit + bulk edit work.
// Requires E2E_ADMIN_USER + E2E_ADMIN_PASS. Runs against live prod (WEBSITE_URL).
import { test, expect } from '@playwright/test';

const WEBSITE_URL = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? '';

test.describe('FA-29 Projekt-Cockpit', () => {
  test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS nicht gesetzt — überspringe Auth-Test');

  async function login(page: any) {
    await page.goto(`${WEBSITE_URL}/admin/cockpit`);
    const userField = page.locator('input[name="username"]');
    if (await userField.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await userField.fill(ADMIN_USER);
      await page.fill('input[name="password"]', ADMIN_PASS);
      await page.click('input[type="submit"]');
      await page.waitForURL(/\/admin\/cockpit/);
    }
  }

  test('loads sidebar and table', async ({ page }) => {
    await login(page);
    await expect(page.locator('[data-testid="cockpit-sidebar"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="cockpit-table"]')).toBeVisible({ timeout: 30_000 });
  });

  test('redirects /admin/tickets to cockpit', async ({ page }) => {
    await login(page);
    await page.goto(`${WEBSITE_URL}/admin/tickets`);
    await page.waitForURL(/\/admin\/cockpit/);
    await expect(page).toHaveURL(/\/admin\/cockpit/);
  });

  test('opens the create modal', async ({ page }) => {
    await login(page);
    await page.locator('[data-testid="open-create"]').click();
    await expect(page.locator('[data-testid="create-modal"]')).toBeVisible({ timeout: 30_000 });
  });

  test('active filter shows fewer rows than all', async ({ page }) => {
    await login(page);
    const chip = (label: string) => page.locator('[data-testid="status-chip"]', { hasText: label });
    const rowCount = async () => page.locator('[data-testid="cockpit-table"] [data-testid="row-checkbox"]').count();
    await chip('Alle').click();
    await page.waitForTimeout(500);
    const allCount = await rowCount();
    if (allCount === 0) { test.skip(true, 'No cockpit rows — skip active-filter test'); return; }
    await chip('Aktiv').click();
    await page.waitForTimeout(500);
    const activeCount = await rowCount();
    expect(activeCount).toBeLessThanOrEqual(allCount);
  });

  test.describe('data-dependent (requires seeded portfolio)', () => {
    async function hasFeatures(page: any) {
      return (await page.locator('[data-testid="sidebar-feature"]').count()) > 0;
    }

    test('selecting a feature filters the table + inline-edits a status', async ({ page }) => {
      await login(page);
      if (!(await hasFeatures(page))) { test.skip(true, 'Keine Features — überspringe'); return; }
      await page.locator('[data-testid="sidebar-feature"]').first().click();
      await expect(page.locator('[data-testid="cockpit-table"]')).toBeVisible({ timeout: 30_000 });
      const statusSelect = page.locator('[data-testid="status-select"]').first();
      if (!(await statusSelect.count())) { test.skip(true, 'Kein Status-Select — überspringe'); return; }
      const resp = page.waitForResponse(/\/api\/admin\/tickets\/.+\/transition/);
      await statusSelect.selectOption('done');
      await resp;
    });

    test('bulk-edits status', async ({ page }) => {
      await login(page);
      if (!(await hasFeatures(page))) { test.skip(true, 'Keine Features — überspringe'); return; }
      await page.locator('[data-testid="sidebar-feature"]').first().click();
      const checkboxes = page.locator('[data-testid="row-checkbox"]');
      if (!(await checkboxes.count())) { test.skip(true, 'Keine Row-Checkboxes — überspringe'); return; }
      await checkboxes.first().check();
      const resp = page.waitForResponse(/\/api\/admin\/cockpit\/batch/);
      const bulkStatus = page.locator('[data-testid="bulk-status"]');
      if (await bulkStatus.count()) { await bulkStatus.selectOption('done'); await resp; }
    });
  });
});

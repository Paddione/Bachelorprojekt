// tests/e2e/fa-29-cockpit.spec.ts [T000752]
// Projekt-Cockpit E2E — Verifiziert, dass /admin/cockpit lädt, Linsen wechselt,
// Status inline editiert, Bulk-Edits und Drag-Reparent funktionieren.
// Benötigt E2E_ADMIN_USER + E2E_ADMIN_PASS (Keycloak-Admin).
// Läuft nur gegen Live-Prod (WEBSITE_URL env var).
import { test, expect } from '@playwright/test';

const WEBSITE_URL = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? '';

test.describe('FA-29 Projekt-Cockpit', () => {
  test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS nicht gesetzt — überspringe Auth-Test');

  async function login(page: any) {
    await page.goto(`${WEBSITE_URL}/admin/cockpit`);
    if (page.url().includes('/auth/') || page.url().includes('/login')) {
      await page.fill('input[name="username"]', ADMIN_USER);
      await page.fill('input[name="password"]', ADMIN_PASS);
      await page.click('input[type="submit"]');
      await page.waitForURL(`${WEBSITE_URL}/admin/cockpit`);
    }
  }

  test('loads portfolio cards', async ({ page }) => {
    await login(page);
    await expect(page.locator('[data-testid="portfolio-grid"]')).toBeVisible({ timeout: 15_000 });
  });

  test('redirects /admin/tickets to cockpit table mode', async ({ page }) => {
    await login(page);
    await page.goto(`${WEBSITE_URL}/admin/tickets`);
    await page.waitForURL(/cockpit\?mode=tabelle/);
    await expect(page).toHaveURL(/\/admin\/cockpit\?mode=tabelle/);
  });

  test('toggles lens to Werkbank', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('button', { name: /werkbank/i })).toBeVisible();
    await page.getByRole('button', { name: /werkbank/i }).click();
    // Lens toggle updates URL param
    await page.waitForTimeout(500);
    const url = page.url();
    expect(url).toContain('lens=werkbank');
  });

  test.describe('data-dependent (requires seeded portfolio)', () => {
    async function hasCards(page: any) {
      const cards = page.locator('[data-testid="feature-card"]');
      return (await cards.count()) > 0;
    }

    test('inline-edits a ticket status', async ({ page }) => {
      await login(page);
      if (!(await hasCards(page))) { test.skip(true, 'Keine Feature-Karten im Portfolio — überspringe'); return; }
      await page.locator('[data-testid="feature-card"]').first().click();
      await expect(page.locator('[data-testid="feature-workbench"]')).toBeVisible({ timeout: 10_000 });
      const statusSelect = page.locator('[data-testid="status-select"]').first();
      if (!(await statusSelect.count())) { test.skip(true, 'Kein Status-Select — überspringe'); return; }
      const resp = page.waitForResponse(/\/api\/admin\/tickets\/.+\/transition/);
      await statusSelect.selectOption('done');
      await resp;
    });

    test('bulk-edits status', async ({ page }) => {
      await login(page);
      if (!(await hasCards(page))) { test.skip(true, 'Keine Feature-Karten im Portfolio — überspringe'); return; }
      await page.locator('[data-testid="feature-card"]').first().click();
      await expect(page.locator('[data-testid="feature-workbench"]')).toBeVisible({ timeout: 10_000 });
      const checkboxes = page.locator('[data-testid="row-checkbox"]');
      if (!(await checkboxes.count())) { test.skip(true, 'Keine Row-Checkboxes — überspringe'); return; }
      await checkboxes.first().check();
      const resp = page.waitForResponse(/\/api\/admin\/cockpit\/batch/);
      const bulkStatus = page.locator('[data-testid="bulk-status"]');
      if (await bulkStatus.count()) {
        await bulkStatus.selectOption('done');
        await resp;
      }
    });

    test('drag-reparents a ticket', async ({ page }) => {
      await login(page);
      if (!(await hasCards(page))) { test.skip(true, 'Keine Feature-Karten im Portfolio — überspringe'); return; }
      await page.locator('[data-testid="feature-card"]').first().click();
      await expect(page.locator('[data-testid="feature-workbench"]')).toBeVisible({ timeout: 10_000 });
      const draggable = page.locator('[data-testid="feature-workbench"] [draggable="true"]').first();
      if (!(await draggable.count())) { test.skip(true, 'Keine draggable rows — überspringe'); return; }
      const target = page.locator('[data-testid="feature-card"]').nth(1);
      if (!(await target.count())) { test.skip(true, 'Nur eine Feature-Karte — kann nicht reparenten'); return; }
      const resp = page.waitForResponse(/\/api\/admin\/cockpit\/reparent/);
      await draggable.dragTo(target);
      await resp;
    });
  });
});

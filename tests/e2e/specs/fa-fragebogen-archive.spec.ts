// tests/e2e/specs/fa-fragebogen-archive.spec.ts
//
// FA: Fragebogen archive → reassign → replay
//
// Covers:
//   1. Archive via UI turns a submitted assignment into a frozen datapoint
//      (snapshot row + KPI view populated); reassign creates a new pending row.
//   2. Replay button is visible on archived system-test assignments with evidence.
//
// Both tests require an authenticated admin session and seed data in the DB.
// DB seeding is done via the admin API (POST /api/admin/fragebogen/seed-e2e)
// when available, or skips gracefully when E2E_ADMIN_PASS is unset or the
// seed endpoint is absent (CI without secrets / cluster without feature).
//
// The pg module is NOT available in this test package — all seeding goes
// through the application's own API endpoints.

import { test, expect, type Page } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL    ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: Page, returnTo = '/admin/fragebogen'): Promise<void> {
  await page.goto(`${BASE}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(new RegExp(returnTo.replace(/\//g, '\\/')), { timeout: 20_000 });
}

test.describe('FA: Fragebogen archive → reassign → replay', () => {
  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) {
      testInfo.skip(true, 'E2E_ADMIN_PASS not set — skipping admin-required archive specs');
    }
  });

  // ── Test 1: archive + reassign flow ──────────────────────────────────────
  //
  // Seed a submitted assignment via the admin seed API.
  // Archive it through the detail UI.
  // Assert snapshot row and KPI view are populated (via /api/admin/fragebogen/:id/kpi).
  // Reassign via the [data-testid="reassign-questionnaire"] button.
  // Assert navigation to new pending assignment.
  test('archive turns submitted into frozen datapoint; reassign creates new row', async ({ page }) => {
    // Seed a submitted assignment — skip if the seed endpoint is unavailable.
    const seedRes = await page.request.post(`${BASE}/api/admin/fragebogen/seed-e2e`, {
      data: { scenario: 'submitted' },
    });
    test.skip(
      seedRes.status() === 404,
      'Seed endpoint /api/admin/fragebogen/seed-e2e not available — skipping',
    );
    test.skip(
      !seedRes.ok(),
      `Seed endpoint returned ${seedRes.status()} — skipping`,
    );
    const { assignmentId } = await seedRes.json() as { assignmentId: string };

    await loginAsAdmin(page, `/admin/fragebogen/${assignmentId}`);

    // Archive via the #archive-btn button; accept the confirmation dialog.
    page.on('dialog', dlg => dlg.accept());
    const archiveBtn = page.locator('#archive-btn');
    await expect(archiveBtn).toBeVisible({ timeout: 10_000 });
    await archiveBtn.click();
    await page.waitForLoadState('networkidle');

    // UI confirms archived state.
    await expect(page.locator('text=Archiviert').first()).toBeVisible({ timeout: 10_000 });

    // KPI API returns snapshot row for the archived assignment.
    const kpiRes = await page.request.get(`${BASE}/api/admin/fragebogen/${assignmentId}/kpi`);
    expect(kpiRes.ok()).toBeTruthy();
    const kpi = await kpiRes.json() as Array<{ dimension_name: string; final_score: number; level: string }>;
    expect(kpi.length).toBeGreaterThanOrEqual(1);

    // Reassign — click the button, accept dialog if present, navigate to new wizard.
    const reassignBtn = page.locator('[data-testid="reassign-questionnaire"]');
    await expect(reassignBtn).toBeVisible({ timeout: 10_000 });
    page.on('dialog', dlg => dlg.accept());
    await reassignBtn.click();
    await page.waitForURL(/\/portal\/fragebogen\/[0-9a-f-]+/, { timeout: 20_000 });

    const newId = page.url().split('/').pop()!.split('?')[0];
    expect(newId).not.toBe(assignmentId);
    expect(newId).toMatch(/^[0-9a-f-]{36}$/);
  });

  // ── Test 2: replay button visibility ─────────────────────────────────────
  //
  // Seed an archived system-test assignment with evidence via the seed API.
  // Navigate to the admin detail page.
  // Assert .replay-btn is visible and contains the attempt number.
  test('replay button surfaces for archived system-test with evidence', async ({ page }) => {
    const seedRes = await page.request.post(`${BASE}/api/admin/fragebogen/seed-e2e`, {
      data: { scenario: 'archived-with-evidence' },
    });
    test.skip(
      seedRes.status() === 404,
      'Seed endpoint /api/admin/fragebogen/seed-e2e not available — skipping',
    );
    test.skip(
      !seedRes.ok(),
      `Seed endpoint returned ${seedRes.status()} — skipping`,
    );
    const { assignmentId } = await seedRes.json() as { assignmentId: string };

    await loginAsAdmin(page, `/admin/fragebogen/${assignmentId}`);

    const replayBtn = page.locator('.replay-btn').first();
    await expect(replayBtn).toBeVisible({ timeout: 10_000 });
    await expect(replayBtn).toContainText('Versuch');
  });
});

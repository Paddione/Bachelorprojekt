// tests/e2e/specs/fa-admin-db-crud-shortcuts.spec.ts
//
// CRUD lifecycle tests for admin shortcuts (quick-links widget on /admin).
// The AdminShortcuts Svelte component calls JSON API endpoints:
//   POST   /api/admin/shortcuts/create  — { url, label }
//   PATCH  /api/admin/shortcuts/update  — { id, url?, label? }
//   DELETE /api/admin/shortcuts/delete  — { id }
//
// Tests use page.request for API calls (carries session cookie) and
// page.goto to verify the UI reflects changes.
//
// Skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin`);
  await page.waitForURL(/realms\/workspace/, { timeout: 60_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin/, { timeout: 60_000 });
}

test.describe('FA-admin-db-crud-shortcuts', () => {

  test('shortcut CRUD: create → verify in UI → update label → verify → delete → verify gone', async ({ page, request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin`,
      { acceptableStatuses: [200, 302, 401], label: 'admin dashboard' },
      testInfo
    );

    await loginAsAdmin(page);

    const ts           = Date.now();
    const label        = `e2e-shortcut-${ts}`;
    const updatedLabel = `e2e-shortcut-updated-${ts}`;
    const url          = `https://example.invalid/e2e-crud-${ts}`;

    // ── 1. Create shortcut via API ──
    const createRes = await page.request.post(`${BASE}/api/admin/shortcuts/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ url, label }),
    });
    expect(createRes.ok()).toBeTruthy();
    const shortcut = await createRes.json() as { id: string; label: string; url: string };
    expect(shortcut.id).toBeTruthy();
    expect(shortcut.label).toBe(label);
    const shortcutId = shortcut.id;

    // ── 2. Navigate to /admin and verify the shortcut label appears ──
    await page.goto(`${BASE}/admin`);
    await page.waitForLoadState('networkidle');
    // The AdminShortcuts Svelte island hydrates with client:load — wait for the label
    await expect(page.locator(`text="${label}"`).first()).toBeVisible({ timeout: 60_000 });

    // ── 3. Update the label via PATCH ──
    const updateRes = await page.request.patch(`${BASE}/api/admin/shortcuts/update`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ id: shortcutId, label: updatedLabel }),
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json() as { id: string; label: string };
    expect(updated.label).toBe(updatedLabel);

    // ── 4. Reload /admin and verify the updated label is visible ──
    await page.goto(`${BASE}/admin`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${updatedLabel}"`).first()).toBeVisible({ timeout: 60_000 });
    // Old label should no longer appear
    await expect(page.locator(`text="${label}"`).first()).toHaveCount(0);

    // ── 5. Delete via DELETE ──
    const deleteRes = await page.request.delete(`${BASE}/api/admin/shortcuts/delete`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ id: shortcutId }),
    });
    expect(deleteRes.ok()).toBeTruthy();
    const deleteBody = await deleteRes.json() as { ok: boolean };
    expect(deleteBody.ok).toBe(true);

    // ── 6. Reload /admin and verify shortcut is gone ──
    await page.goto(`${BASE}/admin`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${updatedLabel}"`)).toHaveCount(0);
  });

  test('POST /api/admin/shortcuts/create returns 403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/shortcuts/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ url: 'https://example.invalid', label: 'unauth' }),
    });
    expect([401, 403]).toContain(res.status());
  });

  test('PATCH /api/admin/shortcuts/update returns 403 without auth', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/admin/shortcuts/update`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', label: 'x' }),
    });
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/admin/shortcuts/delete returns 403 without auth', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/admin/shortcuts/delete`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect([401, 403]).toContain(res.status());
  });
});

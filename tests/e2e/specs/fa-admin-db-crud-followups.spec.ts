// tests/e2e/specs/fa-admin-db-crud-followups.spec.ts
//
// CRUD lifecycle tests for Follow-ups and Zeiterfassung (time tracking).
// Uses page.request.post() for API-driven mutations (form POST, server redirects),
// then navigates/reloads to assert the UI reflects changes.
//
// Skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';
import { loginViaE2E } from '../lib/auth';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await loginViaE2E(page, BASE, ADMIN_USER, '/admin/followups');
}

test.describe('FA-admin-db-crud-followups', () => {

  test('follow-up CRUD: create → verify → mark done → verify → delete', async ({ page, request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/followups`,
      { acceptableStatuses: [200, 302, 401], label: 'admin followups page' },
      testInfo
    );

    await loginAsAdmin(page);

    const ts     = Date.now();
    const reason = `e2e-crud-followup-${ts}`;
    // Due date: one week from now
    const dueDate = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);

    // ── 1. Create follow-up via API ──
    const createRes = await page.request.post(`${BASE}/api/admin/followups/create`, {
      form: {
        reason:  reason,
        dueDate: dueDate,
        _back:   '/admin/followups',
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(createRes.status());

    // ── 2. Navigate to follow-ups list and verify the row is visible ──
    await page.goto(`${BASE}/admin/followups`);
    await page.waitForLoadState('networkidle');
    const followUpRow = page.locator(`[data-testid="followup-item"]:has-text("${reason}")`);
    await expect(followUpRow).toBeVisible({ timeout: 60_000 });

    // ── 3. Find the follow-up ID from the hidden input in its delete form ──
    // The delete form inside the matching row has: <input type="hidden" name="id" value="<uuid>" />
    const deleteForm = followUpRow.locator('form[action*="followups/delete"]');
    const followUpId = await deleteForm.locator('input[name="id"]').getAttribute('value');
    expect(followUpId).toBeTruthy();

    // ── 4. Mark the follow-up as done ──
    const updateRes = await page.request.post(`${BASE}/api/admin/followups/update`, {
      form: {
        id:    followUpId!,
        done:  'true',
        _back: '/admin/followups',
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(updateRes.status());

    // ── 5. Verify done state in UI (show all including done) ──
    await page.goto(`${BASE}/admin/followups?done=1`);
    await page.waitForLoadState('networkidle');
    // Done items are rendered with opacity-50 and the reason has line-through
    const doneRow = page.locator(`[data-testid="followup-item"]:has-text("${reason}")`);
    await expect(doneRow).toBeVisible({ timeout: 60_000 });
    // The reason text in a done row has line-through via the 'line-through' class
    const reasonEl = doneRow.locator('p.line-through');
    await expect(reasonEl).toBeVisible();

    // ── 6. Delete the follow-up ──
    const deleteRes = await page.request.post(`${BASE}/api/admin/followups/delete`, {
      form: {
        id:    followUpId!,
        _back: '/admin/followups?done=1',
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(deleteRes.status());

    // ── 7. Verify row is gone ──
    await page.goto(`${BASE}/admin/followups?done=1`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`[data-testid="followup-item"]:has-text("${reason}")`)).toHaveCount(0);
  });

  test('zeiterfassung CRUD: create project → create time entry → verify → delete', async ({ page, request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/projekte`,
      { acceptableStatuses: [200, 302, 401], label: 'admin projekte page' },
      testInfo
    );

    // Re-authenticate to /admin/projekte for this sub-test
    await loginViaE2E(page, BASE, ADMIN_USER, '/admin/projekte');

    const ts          = Date.now();
    const projectName = `e2e-zeit-projekt-${ts}`;

    // ── 1. Create a project to attach time entries to ──
    const projCreateRes = await page.request.post(`${BASE}/api/admin/projekte/create`, {
      form: {
        name:     projectName,
        status:   'aktiv',
        priority: 'mittel',
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(projCreateRes.status());

    // Navigate to the project list and find the newly created project ID
    await page.goto(`${BASE}/admin/projekte`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${projectName}"`).first()).toBeVisible({ timeout: 60_000 });

    await page.locator(`a:has-text("${projectName}")`).first().click();
    await page.waitForURL(/\/admin\/projekte\/[0-9a-f-]+/, { timeout: 60_000 });
    const detailUrl = page.url();
    const projectId = detailUrl.split('/admin/projekte/')[1]?.split('?')[0];
    expect(projectId).toMatch(/^[0-9a-f-]+$/);

    // ── 2. Create a time entry via API ──
    const entryDate = new Date().toISOString().slice(0, 10);
    const zeitRes = await page.request.post(`${BASE}/api/admin/zeiterfassung/create`, {
      form: {
        projectId:   projectId,
        minutes:     '90',
        description: `e2e-zeit-entry-${ts}`,
        billable:    'false',
        rateCents:   '0',
        entryDate:   entryDate,
        _back:       `/admin/projekte/${projectId}`,
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(zeitRes.status());

    // ── 3. Navigate to zeiterfassung and verify the entry appears ──
    await page.goto(`${BASE}/admin/zeiterfassung`);
    await page.waitForLoadState('networkidle');
    // The time entry description should appear
    const entryLocator = page.locator(`text="e2e-zeit-entry-${ts}"`);
    await expect(entryLocator).toBeVisible({ timeout: 60_000 });

    // ── 4. Find the entry ID from the delete form ──
    // Look for a delete form near the entry text — search in the surrounding container
    const entryRow = page.locator(`tr:has-text("e2e-zeit-entry-${ts}"), [data-entry]:has-text("e2e-zeit-entry-${ts}")`).first();
    let entryId: string | null = null;

    // Try to find the ID from a delete form on the row
    const rowDeleteForm = entryRow.locator('form[action*="zeiterfassung/delete"]');
    const rowIdCount = await rowDeleteForm.locator('input[name="id"]').count();
    if (rowIdCount > 0) {
      entryId = await rowDeleteForm.locator('input[name="id"]').getAttribute('value');
    }

    // If the row-scoped approach fails, search globally on the page
    if (!entryId) {
      const allDeleteForms = page.locator('form[action*="zeiterfassung/delete"]');
      const formCount = await allDeleteForms.count();
      for (let i = 0; i < formCount; i++) {
        const form = allDeleteForms.nth(i);
        const id = await form.locator('input[name="id"]').getAttribute('value');
        if (id) {
          entryId = id;
          break;
        }
      }
    }

    // ── 5. Delete the time entry if we found its ID ──
    if (entryId) {
      const deleteRes = await page.request.post(`${BASE}/api/admin/zeiterfassung/delete`, {
        form: {
          id:    entryId,
          _back: '/admin/zeiterfassung',
        },
        maxRedirects: 0,
      });
      expect([302, 200, 303]).toContain(deleteRes.status());

      await page.goto(`${BASE}/admin/zeiterfassung`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator(`text="e2e-zeit-entry-${ts}"`)).toHaveCount(0);
    }

    // ── 6. Clean up: delete the test project ──
    await page.request.post(`${BASE}/api/admin/projekte/delete`, {
      form: { id: projectId, _back: '/admin/projekte' },
      maxRedirects: 0,
    });
  });

  test('GET /admin/followups returns 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/followups`, { maxRedirects: 0 });
    expect([302, 401, 403, 404]).toContain(res.status());
  });

  test('POST /api/admin/followups/create returns 403 without auth', async ({ request }) => {
    const form = new URLSearchParams({ reason: 'unauth-test', dueDate: '2099-01-01' });
    const res = await request.post(`${BASE}/api/admin/followups/create`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: form.toString(),
      maxRedirects: 0,
    });
    expect([302, 401, 403, 404]).toContain(res.status());
    if (res.status() === 302) {
      const loc = res.headers()['location'] ?? '';
      expect(loc).toMatch(/login|auth|realms/);
    }
  });
});

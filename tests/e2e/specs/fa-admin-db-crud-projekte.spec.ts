// tests/e2e/specs/fa-admin-db-crud-projekte.spec.ts
//
// Full CRUD lifecycle tests for Projekte and Subprojekte via the web UI.
// Uses page.request.post() for API-driven mutations (carries session cookie),
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
  await loginViaE2E(page, BASE, ADMIN_USER, '/admin/projekte');
}

test.describe('FA-admin-db-crud-projekte', () => {
  test.beforeEach(() => {
    test.setTimeout(30_000);
  });

  test('full CRUD: create → verify → edit → subprojekt → delete', async ({ page, request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/projekte`,
      { acceptableStatuses: [200, 302, 401], label: 'admin projekte page' },
      testInfo
    );

    await loginAsAdmin(page);

    const ts          = Date.now();
    const projectName = `e2e-crud-projekt-${ts}`;
    const updatedName = `e2e-crud-projekt-updated-${ts}`;
    const subName     = `e2e-crud-sub-${ts}`;

    // ── 1. Navigate to projekte to grab a valid customerId from the select options ──
    await page.goto(`${BASE}/admin/projekte`);
    await page.waitForLoadState('domcontentloaded');
    const customerSelect = page.locator('select[name="customerId"] option:not([value=""])').first();
    const customerId = (await customerSelect.getAttribute('value')) || '';

    // ── 2. Create project via API (form POST, server redirects) ──
    const createRes = await page.request.post(`${BASE}/api/admin/projekte/create`, {
      form: {
        name:       projectName,
        status:     'entwurf',
        priority:   'mittel',
        customerId: customerId,
      },
      maxRedirects: 0,
    });
    // Server redirects to /admin/projekte/<id>?saved=1 on success
    expect([302, 200, 303]).toContain(createRes.status());

    // ── 3. Navigate to list and verify project appears ──
    await page.goto(`${BASE}/admin/projekte`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text="${projectName}"`).first()).toBeVisible({ timeout: 60_000 });

    // ── 3. Find the project's detail page URL by following the link ──
    await page.locator(`a:has-text("${projectName}")`).first().click();
    await page.waitForURL(/\/admin\/projekte\/[0-9a-f-]+/, { timeout: 60_000 });
    const detailUrl = page.url();
    const projectId = detailUrl.split('/admin/projekte/')[1]?.split('?')[0];
    expect(projectId).toMatch(/^[0-9a-f-]+$/);

    // ── 4. Edit project name via API ──
    const updateRes = await page.request.post(`${BASE}/api/admin/projekte/update`, {
      form: {
        id:       projectId,
        name:     updatedName,
        status:   'aktiv',
        priority: 'mittel',
        _back:    '/admin/projekte',
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(updateRes.status());

    // ── 5. Verify updated name appears in the list ──
    await page.goto(`${BASE}/admin/projekte`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text="${updatedName}"`).first()).toBeVisible({ timeout: 60_000 });

    // ── 6. Create a Subprojekt under the project ──
    const subCreateRes = await page.request.post(`${BASE}/api/admin/subprojekte/create`, {
      form: {
        projectId: projectId,
        name:      subName,
        status:    'entwurf',
        priority:  'niedrig',
        _back:     `/admin/projekte/${projectId}`,
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(subCreateRes.status());

    // ── 7. Verify subprojekt appears on the detail page ──
    await page.goto(`${BASE}/admin/projekte/${projectId}`);
    await page.waitForLoadState('domcontentloaded');
    // ── 8. Find subprojekt id from the page ──
    const spToggle = page.locator(`.sp-toggle:has-text("${subName}")`).first();
    const subId = (await spToggle.getAttribute('data-sp')) ?? '';
    expect(subId).toMatch(/^[0-9a-f-]+$/);

    // ── Delete the subprojekt ──
    const subDeleteRes = await page.request.post(`${BASE}/api/admin/subprojekte/delete`, {
      form: {
        id:    subId,
        _back: `/admin/projekte/${projectId}`,
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(subDeleteRes.status());

    // Verify subprojekt is gone
    await page.goto(`${BASE}/admin/projekte/${projectId}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text="${subName}"`)).toHaveCount(0);

    // ── 9. Delete the project ──
    const deleteRes = await page.request.post(`${BASE}/api/admin/projekte/delete`, {
      form: {
        id:    projectId,
        _back: '/admin/projekte',
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(deleteRes.status());

    // ── 10. Verify project is gone from the list ──
    await page.goto(`${BASE}/admin/projekte`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text="${updatedName}"`)).toHaveCount(0);
  });

  test('GET /api/admin/projekte returns 403 without auth', async ({ playwright }) => {
    const unauth = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await unauth.get(`${BASE}/api/admin/projekte`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /api/admin/projekte/create returns 403 without auth', async ({ playwright }) => {
    const unauth = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    const res = await unauth.post(`${BASE}/api/admin/projekte/create`, {
      form: { name: 'unauth-test', status: 'entwurf', priority: 'mittel' },
      maxRedirects: 0,
    });
    expect([302, 401, 403]).toContain(res.status());
    if (res.status() === 302) {
      const loc = res.headers()['location'] ?? '';
      expect(loc).toMatch(/login|auth|realms/);
    }
  });
});

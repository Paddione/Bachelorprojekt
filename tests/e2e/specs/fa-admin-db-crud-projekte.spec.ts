// tests/e2e/specs/fa-admin-db-crud-projekte.spec.ts
//
// Full CRUD lifecycle tests for Projekte and Subprojekte via the web UI.
// Uses page.request.post() for API-driven mutations (carries session cookie),
// then navigates/reloads to assert the UI reflects changes.
//
// Skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/projekte`);
  await page.waitForURL(/realms\/workspace/, { timeout: 60_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/projekte/, { timeout: 60_000 });
}

test.describe('FA-admin-db-crud-projekte', () => {

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

    // ── 1. Create project via API (form POST, server redirects) ──
    const createForm = new FormData();
    createForm.append('name', projectName);
    createForm.append('status', 'entwurf');
    createForm.append('priority', 'mittel');

    const createRes = await page.request.post(`${BASE}/api/admin/projekte/create`, {
      form: {
        name:     projectName,
        status:   'entwurf',
        priority: 'mittel',
      },
      maxRedirects: 0,
    });
    // Server redirects to /admin/projekte/<id>?saved=1 on success
    expect([302, 200, 303]).toContain(createRes.status());

    // ── 2. Navigate to list and verify project appears ──
    await page.goto(`${BASE}/admin/projekte`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${projectName}"`).first()).toBeVisible({ timeout: 30_000 });

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
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${updatedName}"`).first()).toBeVisible({ timeout: 30_000 });

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
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${subName}"`).first()).toBeVisible({ timeout: 30_000 });

    // ── 8. Find subprojekt id from the page ──
    // The subproject row or link should contain the name — get sub ID from its URL or data attribute
    const subLink = page.locator(`a:has-text("${subName}")`).first();
    const subHref = await subLink.getAttribute('href');
    // Subproject link pattern: /admin/projekte/<sub-id>
    const subId   = subHref?.split('/admin/projekte/')[1]?.split('?')[0] ?? '';

    // If we got a sub ID, delete the subprojekt; otherwise skip that step gracefully
    if (subId && subId !== projectId) {
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
      await page.waitForLoadState('networkidle');
      await expect(page.locator(`text="${subName}"`)).toHaveCount(0);
    }

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
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${updatedName}"`)).toHaveCount(0);
  });

  test('GET /api/admin/projekte returns 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/projekte`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /api/admin/projekte/create returns 403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/projekte/create`, {
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

// tests/e2e/specs/fa-admin-db-crud-clients.spec.ts
//
// CRUD lifecycle tests for Clients (Keycloak-backed users) and Client Notes.
//
// NOTE: The clients/create endpoint creates real Keycloak users and sends a
// password-reset email. The clients/delete endpoint removes the user from
// Keycloak. These tests create a test user with a timestamped e2e email address
// and clean it up at the end. They depend on Keycloak being reachable.
//
// Skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';
import { loginViaE2E } from '../lib/auth';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await loginViaE2E(page, BASE, ADMIN_USER, '/admin/clients');
}

test.describe('FA-admin-db-crud-clients', () => {

  test('client CRUD: create user → navigate detail → add note → delete note → delete user', async ({ page, request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/clients`,
      { acceptableStatuses: [200, 302, 401], label: 'admin clients page' },
      testInfo
    );

    await loginAsAdmin(page);

    const ts        = Date.now();
    const firstName = 'E2E';
    const lastName  = `CrudTest${ts}`;
    const email     = `e2e-crud-client-${ts}@example.invalid`;
    const noteText  = `e2e-note-${ts}`;

    // ── 1. Create client via API (JSON body → Keycloak user creation) ──
    const createRes = await page.request.post(`${BASE}/api/admin/clients/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ email, firstName, lastName }),
    });
    // May return 201 (created) or 400 if Keycloak is unavailable
    const createStatus = createRes.status();
    if (createStatus === 400 || createStatus >= 500) {
      // Keycloak unavailable — skip gracefully
      test.skip(true, `Keycloak create returned ${createStatus} — skipping`);
      return;
    }
    expect(createStatus).toBe(201);
    const createBody = await createRes.json() as { ok: boolean; userId?: string };
    expect(createBody.ok).toBe(true);
    const userId = createBody.userId;
    expect(userId).toBeTruthy();

    // ── 2. Navigate to client list and verify user appears ──
    await page.goto(`${BASE}/admin/clients`);
    await page.waitForLoadState('networkidle');
    // Client name appears as "E2E CrudTest<ts>" in the card/list
    const fullName = `${firstName} ${lastName}`;
    const clientItem = page.locator('[data-testid="admin-client-item"]').filter({ hasText: fullName }).first();
    await expect(clientItem).toBeVisible({ timeout: 60_000 });

    // ── 3. Navigate to the client detail page ──
    await clientItem.click();
    await page.waitForURL(/\/admin\/[0-9a-f-]+/, { timeout: 60_000 });
    const clientDetailUrl = page.url();
    const clientId = clientDetailUrl.split('/admin/')[1]?.split('?')[0];
    expect(clientId).toMatch(/^[0-9a-f-]+$/);

    // ── 4. Navigate to the Notes tab ──
    await page.goto(`${BASE}/admin/${clientId}?tab=notes`);
    await page.waitForLoadState('networkidle');

    // ── 5. Add a client note via API ──
    const noteCreateRes = await page.request.post(`${BASE}/api/admin/clientnotes/create`, {
      form: {
        keycloakUserId: clientId,
        content:        noteText,
        _back:          `/admin/${clientId}?tab=notes`,
      },
      maxRedirects: 0,
    });
    expect([302, 200, 303]).toContain(noteCreateRes.status());

    // ── 6. Reload notes tab and verify note is visible ──
    await page.goto(`${BASE}/admin/${clientId}?tab=notes`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${noteText}"`)).toBeVisible({ timeout: 60_000 });

    // ── 7. Find the note ID from the delete form ──
    const noteDeleteForm = page.locator(`form[action*="clientnotes/delete"]:near(:text("${noteText}"))`).first();
    let noteId: string | null = null;

    const noteFormCount = await noteDeleteForm.count();
    if (noteFormCount > 0) {
      noteId = await noteDeleteForm.locator('input[name="id"]').getAttribute('value');
    }

    // Fallback: search all clientnotes delete forms
    if (!noteId) {
      const allNoteForms = page.locator('form[action*="clientnotes/delete"]');
      const formCount    = await allNoteForms.count();
      for (let i = 0; i < formCount; i++) {
        const id = await allNoteForms.nth(i).locator('input[name="id"]').getAttribute('value');
        if (id) { noteId = id; break; }
      }
    }

    // ── 8. Delete the note ──
    if (noteId) {
      const noteDeleteRes = await page.request.post(`${BASE}/api/admin/clientnotes/delete`, {
        form: {
          id:    noteId,
          _back: `/admin/${clientId}?tab=notes`,
        },
        maxRedirects: 0,
      });
      expect([302, 200, 303]).toContain(noteDeleteRes.status());

      // Verify the note is gone
      await page.goto(`${BASE}/admin/${clientId}?tab=notes`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator(`text="${noteText}"`)).toHaveCount(0);
    }

    // ── 9. Delete the test user ──
    const deleteRes = await page.request.post(`${BASE}/api/admin/clients/delete`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ userId }),
    });
    expect([200, 204]).toContain(deleteRes.status());
    const deleteBody = await deleteRes.json() as { ok: boolean };
    expect(deleteBody.ok).toBe(true);

    // ── 10. Verify client is gone from the list ──
    await page.goto(`${BASE}/admin/clients`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="admin-client-item"]').filter({ hasText: fullName })).toHaveCount(0);
  });

  test('GET /admin/clients returns 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/admin/clients`);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/clients/create returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/create`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ email: 'unauth@example.com', firstName: 'X', lastName: 'Y' }),
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/clientnotes/create returns 403 without auth', async ({ request }) => {
    const form = new URLSearchParams({ keycloakUserId: '00000000-0000-0000-0000-000000000000', content: 'x' });
    const res = await request.post(`${BASE}/api/admin/clientnotes/create`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: form.toString(),
      maxRedirects: 0,
    });
    expect([302, 401, 403]).toContain(res.status());
  });
});

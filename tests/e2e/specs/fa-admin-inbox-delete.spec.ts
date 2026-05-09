// tests/e2e/specs/fa-admin-inbox-delete.spec.ts
//
// FA-admin-inbox-delete — covers the "Löschen" escape hatch added 2026-05-09
// to /admin/inbox. The hatch lets admins clear inbox rows regardless of
// status (pending/actioned/archived) — previously rows that left `pending`
// had no remediation, which left paddione with 27 stuck rows.
//
// Flow:
//   1. Seed a contact-form row with `is_test_data=true` via POST /api/contact
//      using the X-E2E-Test + X-Cron-Secret header pair (option-A from the
//      design discussion). This avoids the "every email containing the word
//      test gets reaped" false-positive risk of pattern-matching.
//   2. Log in as admin, open /admin/inbox.
//   3. Locate the seeded row, select it, dismiss the window.confirm() that
//      `deleteItem` raises, click the Löschen button, accept the confirm,
//      and assert the row vanishes from the list.
//   4. Verify the underlying inbox row is gone via GET /api/admin/inbox
//      (defense in depth — the visual disappearance is necessary but not
//      sufficient).
//
// Cleanup is automatic: globalSetup/globalTeardown both POST
// /api/admin/systemtest/purge-all-test-data, which (after PR #608) sweeps
// inbox_items WHERE is_test_data=true. Even if this spec aborts mid-flight,
// the next run's globalSetup wipes the seeded row.

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE        = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS  = process.env.E2E_ADMIN_PASS;
const CRON_SECRET = process.env.CRON_SECRET;

async function loginAsAdmin(page: Page, returnTo = '/admin/inbox'): Promise<void> {
  await page.goto(`${BASE}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/inbox/, { timeout: 20_000 });
}

/**
 * Seed a `contact` inbox row tagged as test-data via the public API. The
 * X-E2E-Test + X-Cron-Secret header pair tells the endpoint to stamp
 * `is_test_data=true`, which has two effects:
 *   1. The purge function reaps it on the next bracket (defense in depth).
 *   2. We can identify it later via the unique seed name without a payload
 *      ID round-trip (since /api/contact returns 200 with no body).
 *
 * Returns the unique seed name we used so the test can locate the row.
 */
async function seedTestContactRow(api: APIRequestContext): Promise<string> {
  const seedName = `[TEST] inbox-delete ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await api.post(`${BASE}/api/contact`, {
    headers: {
      'Content-Type': 'application/json',
      'X-E2E-Test': '1',
      'X-Cron-Secret': CRON_SECRET!,
    },
    data: {
      name: seedName,
      email: 'fa-admin-inbox-delete@example.invalid',
      type: 'allgemein',
      message: 'systemtest seed for fa-admin-inbox-delete; safe to purge',
    },
  });
  expect(res.status()).toBe(200);
  return seedName;
}

test.describe('FA-admin-inbox-delete: Löschen escape hatch', () => {
  test.beforeEach(({ }, testInfo) => {
    if (!ADMIN_PASS) {
      testInfo.skip(true, 'E2E_ADMIN_PASS not set — skipping admin inbox delete spec');
    }
    if (!CRON_SECRET) {
      testInfo.skip(true, 'CRON_SECRET not set — cannot seed test rows');
    }
  });

  test('löschen-button: seeded row appears, can be deleted, vanishes', async ({ page, request }) => {
    // 1. Seed a fresh row tagged is_test_data=true.
    const seedName = await seedTestContactRow(request);

    // 2. Log in and load the inbox.
    await loginAsAdmin(page);
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    // 3. Filter to `contact` so we can locate the seeded row by its
    //    unique name in the list. The seed name appears in the row's
    //    payload, which renders into the row's text content.
    await root
      .locator('[data-testid="inbox-sidebar-item"][data-type="contact"]')
      .click();
    await page.waitForTimeout(200);

    const list = root.locator('[data-testid="inbox-list"]');
    const seededRow = list.locator(`[data-testid="inbox-list-row"]`, {
      hasText: seedName,
    }).first();

    await expect(seededRow).toBeVisible({ timeout: 10_000 });

    // 4. Select the row → detail pane shows it.
    await seededRow.click();
    const detail = root.locator('[data-testid="inbox-detail"][data-type="contact"]');
    await expect(detail).toBeVisible({ timeout: 5_000 });

    // 5. The Löschen button must be present on every row regardless of status.
    const deleteBtn = detail.locator('[data-testid="inbox-action-delete"]');
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toBeEnabled();

    // 6. Auto-accept the window.confirm() that deleteItem() raises.
    page.once('dialog', (d) => { void d.accept(); });

    // 7. Click → row vanishes from the list. Track the row count by name
    //    so we don't false-positive on other unrelated contact rows.
    const beforeCount = await list
      .locator('[data-testid="inbox-list-row"]', { hasText: seedName })
      .count();
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    await deleteBtn.click();
    await expect(
      list.locator('[data-testid="inbox-list-row"]', { hasText: seedName }),
    ).toHaveCount(0, { timeout: 5_000 });

    // 8. Defense in depth: verify the row is gone server-side too. The
    //    admin inbox endpoint requires a session — reuse the page's cookies.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const res = await request.get(`${BASE}/api/admin/inbox?status=pending`, {
      headers: { cookie: cookieHeader },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json() as {
      items: Array<{ payload: Record<string, unknown> }>;
    };
    const stillPresent = data.items.some(
      (it) => typeof it.payload?.name === 'string' && it.payload.name === seedName,
    );
    expect(stillPresent).toBe(false);
  });

  test('löschen-button: present on archived rows too (escape hatch contract)', async ({ page }) => {
    // The hatch's whole point is that it works on rows that already left
    // `pending`. We can't reliably guarantee the live archive has rows on
    // every cluster — when it doesn't, we skip rather than failing.
    await loginAsAdmin(page, '/admin/inbox?status=archived');
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    const list = root.locator('[data-testid="inbox-list"]');
    const firstRow = list.locator('[data-testid="inbox-list-row"]').first();
    const hasRow = (await firstRow.count()) > 0;
    test.skip(!hasRow, 'archive is empty on this cluster — escape hatch contract is unobservable');

    await firstRow.click();
    const detail = root.locator('[data-testid="inbox-detail"]');
    await expect(detail).toBeVisible({ timeout: 5_000 });

    // The delete button MUST be visible AND enabled on archived rows —
    // that's the contract this whole feature exists for.
    const deleteBtn = detail.locator('[data-testid="inbox-action-delete"]');
    await expect(deleteBtn).toBeVisible();
    await expect(deleteBtn).toBeEnabled();
  });
});

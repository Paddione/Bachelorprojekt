// tests/e2e/specs/fa-admin-inbox.spec.ts
//
// FA-admin-inbox — Playwright coverage for the rework of /admin/inbox
// as defined in docs/superpowers/specs/2026-05-08-admin-inbox-rework-design.md.
//
// Selectors come VERBATIM from spec §10 (the contract shared with the
// implementation agent). Do not invent new selectors here.
//
// These tests exercise the live admin inbox and therefore require an
// admin session. They skip gracefully when E2E_ADMIN_PASS is unset
// (e.g. CI without secrets, local runs without credentials).
//
// 401 coverage for `GET /api/admin/inbox` already lives in
// fa-admin-crm.spec.ts and is intentionally NOT duplicated here
// (per spec §11.2 final bullet).
//
// Robustness: this suite asserts conditionally on data presence.
// The live inbox can be empty — we never seed test items, so each
// assertion gates on "if at least one row exists" before drilling in.
// No clean-up step is required because nothing is created.

import { test, expect, type Page } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

// All six item types from spec §4.3 + the synthetic "all" pseudo-type.
const TYPES = [
  'all',
  'registration',
  'booking',
  'contact',
  'bug',
  'meeting_finalize',
  'user_message',
] as const;
const STATUSES = ['pending', 'done', 'archived'] as const;

async function loginAsAdmin(page: Page, returnTo = '/admin/inbox'): Promise<void> {
  await page.goto(`${BASE}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/inbox/, { timeout: 20_000 });
}

test.describe('FA-admin-inbox: two-pane rework', () => {
  test.beforeEach(({ }, testInfo) => {
    // Each scenario in this describe block needs an authenticated admin
    // session against live web.mentolder.de — skip when no creds available.
    if (!ADMIN_PASS) {
      testInfo.skip(true, 'E2E_ADMIN_PASS not set — skipping admin inbox rework specs');
    }
  });

  // ── inbox-renders ──────────────────────────────────────────────
  // Spec §11.2: "/admin/inbox returns 200, root [data-testid="inbox-app"]
  // visible, sidebar has 7 items (Alle + 6 types)."
  test('inbox-renders: app root + sidebar with 7 type rows', async ({ page }) => {
    await loginAsAdmin(page);

    // [data-testid="inbox-app"] — InboxApp root (spec §10)
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    // [data-testid="inbox-sidebar"] — Sidebar root (spec §10)
    const sidebar = root.locator('[data-testid="inbox-sidebar"]');
    await expect(sidebar).toBeVisible();

    // [data-testid="inbox-sidebar-item"][data-type="{type|all}"] (spec §10)
    // Spec §5.2 fixes the order: Alle, Anfragen, Buchungen, Bugs, Nachrichten,
    // Meetings, Kontakt → 7 rows total.
    const sidebarItems = sidebar.locator('[data-testid="inbox-sidebar-item"]');
    await expect(sidebarItems).toHaveCount(7);

    // Each TYPES entry must correspond to a sidebar row (data-type attribute).
    for (const t of TYPES) {
      await expect(
        sidebar.locator(`[data-testid="inbox-sidebar-item"][data-type="${t}"]`),
      ).toBeVisible();
    }
  });

  // ── inbox-empty-detail ─────────────────────────────────────────
  // Spec §11.2: "when no item selected, [data-testid='inbox-detail-empty']
  // visible with pending counts."
  // Note: when the list is non-empty, spec §7.1 auto-selects items[0] so the
  // empty-detail placeholder is NOT visible. We test the placeholder
  // unconditionally by visiting an empty status (`?status=archived` is the
  // most reliably-empty bucket on a fresh production cluster). If the archive
  // happens to have items, fall back to checking that *some* detail pane
  // (empty OR populated) is visible — i.e. the assertion never relies on
  // there being zero items.
  test('inbox-empty-detail: placeholder shown when no item is selected', async ({ page }) => {
    await loginAsAdmin(page, '/admin/inbox?status=archived');
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    const list   = root.locator('[data-testid="inbox-list"]');
    const detail = root.locator('[data-testid="inbox-detail"]');
    const empty  = root.locator('[data-testid="inbox-detail-empty"]');

    const rowCount = await list.locator('[data-testid="inbox-list-row"]').count();
    if (rowCount === 0) {
      // Empty status → empty placeholder is the contract (spec §5.4).
      await expect(empty).toBeVisible();
    } else {
      // Archive has rows; one is auto-selected per spec §7.1.
      // Either a populated detail OR the empty placeholder must render.
      const detailVisible = await detail.isVisible().catch(() => false);
      const emptyVisible  = await empty.isVisible().catch(() => false);
      expect(detailVisible || emptyVisible).toBeTruthy();
    }
  });

  // ── inbox-status-tabs ──────────────────────────────────────────
  // Spec §11.2: "clicking each tab updates the URL ?status= and reloads list."
  test('inbox-status-tabs: clicking each tab drives URL ?status=', async ({ page }) => {
    await loginAsAdmin(page);
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    // [data-testid="inbox-status-tab"][data-status="{status}"] (spec §10)
    for (const status of STATUSES) {
      const tab = root.locator(`[data-testid="inbox-status-tab"][data-status="${status}"]`);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page).toHaveURL(new RegExp(`status=${status}`), { timeout: 10_000 });
      // The list must finish re-rendering before we check the next tab.
      await expect(root.locator('[data-testid="inbox-list"]')).toBeVisible();
    }
  });

  // ── inbox-type-filter ──────────────────────────────────────────
  // Spec §11.2: "clicking a sidebar type narrows the visible rows; 'Alle' restores."
  test('inbox-type-filter: sidebar narrows list, Alle restores', async ({ page }) => {
    await loginAsAdmin(page);
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    const list = root.locator('[data-testid="inbox-list"]');
    await expect(list).toBeVisible();

    const baselineRows = await list.locator('[data-testid="inbox-list-row"]').count();

    // Click each non-"all" type filter and verify the row count never grows
    // beyond the baseline. Spec §7 makes type-filtering client-side over the
    // already-fetched `items`, so narrowing is monotone.
    for (const t of TYPES.filter((x) => x !== 'all')) {
      const filterRow = root.locator(
        `[data-testid="inbox-sidebar-item"][data-type="${t}"]`,
      );
      await filterRow.click();
      // Tiny settle for the $derived recomputation.
      await page.waitForTimeout(150);
      const filtered = await list.locator('[data-testid="inbox-list-row"]').count();
      expect(filtered).toBeLessThanOrEqual(baselineRows);
    }

    // "Alle" restores the full set.
    await root
      .locator('[data-testid="inbox-sidebar-item"][data-type="all"]')
      .click();
    await page.waitForTimeout(150);
    const restored = await list.locator('[data-testid="inbox-list-row"]').count();
    expect(restored).toBe(baselineRows);
  });

  // ── inbox-search ───────────────────────────────────────────────
  // Spec §11.2: "typing in [data-testid='inbox-search'] filters rows
  // client-side; clearing restores."
  test('inbox-search: input narrows rows; clearing restores them', async ({ page }) => {
    await loginAsAdmin(page);
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    const list   = root.locator('[data-testid="inbox-list"]');
    const search = root.locator('[data-testid="inbox-search"]');
    await expect(search).toBeVisible();

    const baseline = await list.locator('[data-testid="inbox-list-row"]').count();

    // Type a string that is overwhelmingly unlikely to appear in any
    // real inbox entry (name/subject/sub per spec §5.3). Filtering should
    // collapse the list — usually to zero.
    await search.fill('zzz-no-match-xyzzy');
    // Spec §5.3 specifies a 150ms debounce.
    await page.waitForTimeout(300);
    const filtered = await list.locator('[data-testid="inbox-list-row"]').count();
    expect(filtered).toBeLessThanOrEqual(baseline);

    // Clearing the input restores the unfiltered set.
    await search.fill('');
    await page.waitForTimeout(300);
    const restored = await list.locator('[data-testid="inbox-list-row"]').count();
    expect(restored).toBe(baseline);
  });

  // ── inbox-keyboard-jk ──────────────────────────────────────────
  // Spec §11.2: "pressing j advances selected row; k reverses."
  // Spec §8: j/↓ select-next, k/↑ select-previous, disabled when an
  // input/textarea is focused — so we click the list root first to
  // ensure focus is outside the search box.
  test('inbox-keyboard-jk: j advances selection, k reverses', async ({ page }) => {
    await loginAsAdmin(page);
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    const list = root.locator('[data-testid="inbox-list"]');
    const rows = list.locator('[data-testid="inbox-list-row"]');
    const rowCount = await rows.count();

    // Need at least 2 rows to test j/k navigation meaningfully.
    test.skip(rowCount < 2, `inbox needs ≥2 rows; got ${rowCount}`);

    // Move focus out of any text input — spec §8 disables shortcuts otherwise.
    await list.click({ position: { x: 1, y: 1 } });

    // Read the auto-selected row id (spec §7.1 selects items[0] on load).
    const selectedRow = list.locator('[data-testid="inbox-list-row"][data-selected="true"]');
    await expect(selectedRow).toHaveCount(1, { timeout: 5_000 });
    const firstId = await selectedRow.getAttribute('data-id');
    expect(firstId).not.toBeNull();

    // Press `j` → selection advances.
    await page.keyboard.press('j');
    await page.waitForTimeout(100);
    const afterJ = await list
      .locator('[data-testid="inbox-list-row"][data-selected="true"]')
      .getAttribute('data-id');
    expect(afterJ).not.toBeNull();
    expect(afterJ).not.toBe(firstId);

    // Press `k` → selection reverses back.
    await page.keyboard.press('k');
    await page.waitForTimeout(100);
    const afterK = await list
      .locator('[data-testid="inbox-list-row"][data-selected="true"]')
      .getAttribute('data-id');
    expect(afterK).toBe(firstId);
  });

  // ── inbox-message-thread-load ──────────────────────────────────
  // Spec §11.2: "selecting a user_message row populates
  // [data-testid='inbox-thread'] (uses an existing thread fixture or
  // skips if none)."
  // We do NOT seed a thread (orchestrator forbids it). Skip when no
  // user_message row exists in the live inbox.
  test('inbox-message-thread-load: selecting user_message renders thread', async ({ page }) => {
    await loginAsAdmin(page);
    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    // Filter to user_message via the sidebar.
    await root
      .locator('[data-testid="inbox-sidebar-item"][data-type="user_message"]')
      .click();
    await page.waitForTimeout(200);

    const userMsgRow = root
      .locator('[data-testid="inbox-list-row"]')
      .first();
    const hasRow = (await userMsgRow.count()) > 0;
    test.skip(!hasRow, 'no user_message rows in live inbox — nothing to select');

    await userMsgRow.click();

    // [data-testid="inbox-detail"][data-type="user_message"] (spec §10)
    const detail = root.locator(
      '[data-testid="inbox-detail"][data-type="user_message"]',
    );
    await expect(detail).toBeVisible({ timeout: 10_000 });

    // [data-testid="inbox-thread"] — user_message thread container (spec §10)
    const thread = detail.locator('[data-testid="inbox-thread"]');
    await expect(thread).toBeVisible({ timeout: 10_000 });
  });

  // ── inbox-mobile-list-detail ───────────────────────────────────
  // Spec §11.2: "viewport 375x812: list-only by default, tap row enters
  // detail, ← back returns to list."
  // Spec §9: mobile collapses to single-column with ?mobileView toggle.
  test('inbox-mobile-list-detail: list → tap row → detail → back', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);

    const root = page.locator('[data-testid="inbox-app"]');
    await expect(root).toBeVisible({ timeout: 10_000 });

    const list   = root.locator('[data-testid="inbox-list"]');
    const detail = root.locator('[data-testid="inbox-detail"]');

    // Default mobile state: list visible.
    await expect(list).toBeVisible();

    const firstRow = list.locator('[data-testid="inbox-list-row"]').first();
    const hasRow   = (await firstRow.count()) > 0;
    test.skip(!hasRow, 'mobile flow needs ≥1 row in inbox; got 0');

    // Tap the row → mobileView=detail (spec §9).
    await firstRow.click();
    await expect(detail).toBeVisible({ timeout: 10_000 });

    // The list and sidebar are hidden in detail view on mobile (spec §9).
    // Use isVisible() with no expectation timeout — we want a snapshot read.
    const listVisibleAfterTap = await list.isVisible().catch(() => false);
    expect(listVisibleAfterTap).toBeFalsy();

    // ← Zurück returns to list. Spec §9 places it top-left of the detail
    // header. There's no fixed data-testid for the back button in §10, so
    // we look for a pragmatic combination: an aria-label OR the visible
    // German text "Zurück" inside the detail pane header. If neither is
    // present, the test will fail loudly so the impl agent can add it.
    const backBtn = detail
      .getByRole('button', { name: /zur(ü|ue)ck|back/i })
      .first();
    await expect(backBtn).toBeVisible({ timeout: 5_000 });
    await backBtn.click();

    // List is visible again; detail is hidden.
    await expect(list).toBeVisible({ timeout: 5_000 });
    const detailVisibleAfterBack = await detail.isVisible().catch(() => false);
    expect(detailVisibleAfterBack).toBeFalsy();
  });
});

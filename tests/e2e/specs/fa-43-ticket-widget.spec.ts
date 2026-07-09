// tests/e2e/specs/fa-43-ticket-widget.spec.ts
//
// Regression: TicketWidgetBar was missing the showEdit prop implementation,
// so TicketQuickEdit (✏️) was never rendered even though PortalLayout passes
// showEdit={!ASSISTANT_ENABLED}. TicketQuickCreate ("Fehler melden") always
// shows in portal (showCreate defaults to true).

import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE       = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAndGo(page: import('@playwright/test').Page, path: string) {
  await page.goto(`${BASE}/api/auth/login?returnTo=${path}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 60_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 20_000 });
}

test.describe('FA-43: TicketWidgetBar — portal widget rendering', () => {
  // ── Auth gating ─────────────────────────────────────────────────────
  test('T1: /portal requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/portal`);
    await expect(page).not.toHaveURL(`${BASE}/portal`);
  });

  test('T2: GET /api/admin/tickets returns 403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/tickets`);
    expect(res.status()).toBe(403);
  });

  // ── Authenticated widget tests ─────────────────────────────────────
  test.describe('authenticated portal widgets', () => {
    test.beforeEach(async ({ request }, testInfo) => {
      await assertAuthenticatedReachable(
        request,
        `${BASE}/portal`,
        { acceptableStatuses: [200, 302, 401], label: 'portal' },
        testInfo
      );
    });

    // ── TicketQuickCreate always visible in portal ───────────────────────
    test('T3: portal shows floating "Fehler melden" create button', async ({ page }) => {
      await loginAndGo(page, '/portal');
      await page.waitForLoadState('networkidle');

      // The floating widget bar is fixed bottom-right; aria-label uniquely identifies the create btn
      const createBtn = page.locator('button[aria-label="Fehler melden"]');
      await expect(createBtn).toBeVisible({ timeout: 30_000 });
    });

    // ── TicketWidgetBar DOM presence (showEdit prop regression guard) ─────
    test('T4: portal widget bar is attached in DOM', async ({ page }) => {
      await loginAndGo(page, '/portal');
      await page.waitForLoadState('networkidle');

      // The fixed bottom-right container must be present — confirms TicketWidgetBar renders at all
      const widgetBar = page.locator('.fixed.bottom-6.right-6');
      await expect(widgetBar).toBeAttached({ timeout: 10_000 });
    });

    // ── Admin layout: no floating create widget (moved to PlatformHub) ──
    test('T5: admin layout has no floating aria-labeled "Fehler melden" button', async ({ page }) => {
      await loginAndGo(page, '/admin');
      await page.waitForLoadState('networkidle');

      // showCreate=false in AdminLayout — the floating widget button must not render
      const floatingBtn = page.locator('button[aria-label="Fehler melden"]');
      await expect(floatingBtn).toHaveCount(0);
    });

    // ── PlatformHub Tickets tab: admin ticket creation ─────────────────
    test('T6: PlatformHub Tickets tab renders create form', async ({ page }) => {
      await loginAndGo(page, '/admin/platform');
      await page.waitForLoadState('networkidle');

      // Tickets is the first tab (default open), create-form heading is "NEUES TICKET ▲"
      const formHeading = page.getByText('NEUES TICKET', { exact: false });
      await expect(formHeading).toBeVisible({ timeout: 30_000 });
    });
  });
});

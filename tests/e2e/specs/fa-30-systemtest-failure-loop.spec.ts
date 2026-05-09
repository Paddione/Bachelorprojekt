// tests/e2e/specs/fa-30-systemtest-failure-loop.spec.ts
//
// FA-30 — System-test failure loop (Task 7 deliverable).
//
// FA-30 v1 verifies the kanban renders. Full loop verification (seed →
// fail mark → ticket → retest) is deferred until tests/e2e/ has a
// fixture-seeding hook — there is no clean way to insert a system-test
// assignment from outside the test process today, and using the public
// /api/admin/systemtest/seed endpoint requires an admin session and a
// pre-registered seed module that already exists for the template.
//
// Scope:
//   1. Admin login
//   2. Visit /admin/systemtest/board
//   3. Assert all 4 column headers render
//   4. Assert the API endpoint returns the canonical shape
//   5. Assert no JS errors on page load
//
// The test skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

const COLUMN_TITLES = ['Offen', 'Fix in PR', 'Retest ausstehend', 'Grün (7 Tage)'];

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/login?returnTo=/admin/systemtest/board`);
  await page.waitForURL(/realms\/workspace/, { timeout: 20_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(/\/admin\/systemtest\/board/, { timeout: 20_000 });
}

test.describe('FA-30: System-test failure loop kanban', () => {
  test('T1: /admin/systemtest/board redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${BASE}/admin/systemtest/board`);
    // Expect either Keycloak (if SITE_URL/login configured) or the local
    // /admin/login redirect — never the board itself.
    await expect(page).not.toHaveURL(/\/admin\/systemtest\/board$/);
  });

  test('T2: /api/admin/systemtest/board requires admin auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/systemtest/board`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: kanban page renders all four column headers (admin)', async ({ page }) => {
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping admin-required check');

    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await loginAsAdmin(page);
    await page.waitForLoadState('networkidle');

    for (const title of COLUMN_TITLES) {
      await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible({
        timeout: 10_000,
      });
    }

    // No fatal page errors after first poll.
    const fatal = consoleErrors.filter((m) =>
      // Filter unrelated noise: vite HMR pings, third-party widgets, etc.
      !/HMR|WebSocket|service worker/i.test(m),
    );
    expect(fatal, fatal.join('\n')).toEqual([]);
  });

  test('T4: /api/admin/systemtest/board returns canonical shape (admin session)', async ({ page }) => {
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping admin-required check');

    await loginAsAdmin(page);
    const res = await page.request.get(`${BASE}/api/admin/systemtest/board`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('columns');
    expect(body).toHaveProperty('undelivered');
    for (const key of ['open', 'fix_in_pr', 'retest_pending', 'green']) {
      expect(body.columns).toHaveProperty(key);
      expect(Array.isArray(body.columns[key])).toBe(true);
    }
    expect(typeof body.undelivered).toBe('number');
  });
});

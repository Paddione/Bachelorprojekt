// tests/e2e/specs/fa-53-systemtest-failure-loop.spec.ts
//
// FA-53 — System-test failure loop (Task 7 deliverable).
//
// FA-53 v1 verifies the kanban renders. Full loop verification (seed →
// fail mark → ticket → retest) is deferred until tests/e2e/ has a
// fixture-seeding hook — there is no clean way to insert a system-test
// assignment from outside the test process today, and using the public
// /api/admin/systemtest/seed endpoint requires an admin session and a
// pre-registered seed module that already exists for the template.
//
// Scope:
//   1. Admin login
//   2. Visit /sdlc/systemtest/board
//   3. Assert all 4 column headers render (or feature-flag redirect if disabled)
//   4. Assert the API endpoint returns the canonical shape
//   5. Assert no JS errors on page load
//
// The test skips gracefully when E2E_ADMIN_PASS is unset (CI without secrets).

import { test, expect } from '@playwright/test';
import { loginViaE2E } from '../lib/auth';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE       = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const isKorczewski = BASE.includes('korczewski.de');
const ADMIN_USER = isKorczewski
  ? (process.env.TEST_ADMIN_USER ?? 'test-admin')
  : (process.env.E2E_ADMIN_USER ?? 'paddione');
const ADMIN_PASS = isKorczewski
  ? (process.env.TEST_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASS)
  : process.env.E2E_ADMIN_PASS;

const COLUMN_TITLES = ['Offen', 'Fix in PR', 'Retest ausstehend', 'Grün (7 Tage)'];

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await loginViaE2E(page, BASE, ADMIN_USER, '/sdlc/systemtest/board');
}

test.describe('FA-53: System-test failure loop kanban', () => {
  test('T1: /sdlc/systemtest/board redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${BASE}/sdlc/systemtest/board`);
    // Expect either Keycloak (if SITE_URL/login configured) or the local
    // /admin/login redirect — never the board itself.
    await expect(page).not.toHaveURL(/\/sdlc\/systemtest\/board$/);
  });

  test('T2: /sdlc/api/systemtest/board requires admin auth', async ({ request }) => {
    const res = await request.get(`${BASE}/sdlc/api/systemtest/board`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test.describe('authenticated kanban checks', () => {
    test.beforeEach(async ({ request }, testInfo) => {
      await assertAuthenticatedReachable(
        request,
        `${BASE}/sdlc/systemtest/board`,
        { acceptableStatuses: [200, 302, 401], label: 'admin systemtest board' },
        testInfo
      );
    });

    test('T3: kanban page renders all four column headers (admin)', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('pageerror', (err) => consoleErrors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await loginAsAdmin(page);
      await page.waitForLoadState('networkidle');

      // If systemtest loop is feature-flagged off, page redirects to /admin?msg=systemtest-loop-disabled
      if (page.url().includes('msg=systemtest-loop-disabled')) {
        test.skip(true, 'SYSTEMTEST_LOOP_ENABLED is disabled on this cluster');
        return;
      }

      for (const title of COLUMN_TITLES) {
        await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible({
          timeout: 60_000,
        });
      }

      // No fatal page errors after first poll.
      const fatal = consoleErrors.filter((m) =>
        // Filter unrelated noise: vite HMR pings, third-party widgets, etc.
        !/HMR|WebSocket|service worker/i.test(m),
      );
      expect(fatal, fatal.join('\n')).toEqual([]);
    });

    test('T4: /sdlc/api/systemtest/board returns canonical shape (admin session)', async ({ page }) => {
      await loginAsAdmin(page);
      const res = await page.request.get(`${BASE}/sdlc/api/systemtest/board`);
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
});

import { test, expect } from '@playwright/test';

const BASE       = process.env.WEBSITE_URL    ?? 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

/**
 * T001656: coaching-studio Workspace crashes on "Neue Session" when CUSTOMERS
 * is empty.
 *
 * PR #2545 (T001560) emptied the hardcoded `CUSTOMERS` array in
 * `website/public/coaching-studio/data.jsx` (privacy — no more seeded fake
 * clients). Several screens still defaulted to `customer || CUSTOMERS[0]`,
 * which now resolves to `undefined` and crashes `Workspace()` with
 * "Cannot read properties of undefined (reading 'name')" as soon as
 * "Neue Session" is clicked from an empty client list.
 *
 * The fix adds an `EMPTY_CUSTOMER` placeholder object in `data.jsx` and uses
 * it as a final fallback (`customer || CUSTOMERS[0] || EMPTY_CUSTOMER`) in
 * `workspace.jsx`, `screens_core.jsx` (×2) and `screens_more.jsx`.
 *
 * The prototype is a plain Babel-in-browser JSX bundle with no
 * bundler/module system (loaded via `<script type="text/babel">` in
 * `website/src/pages/admin/coaching/studio.astro`), so there is no unit-test
 * harness that can import it — a real browser is the only realistic way to
 * verify the fix.
 */

async function loginAsAdmin(page: import('@playwright/test').Page, returnTo = '/admin/coaching/studio'): Promise<void> {
  if (!ADMIN_PASS) throw new Error('E2E_ADMIN_PASS is not set');
  await page.goto(`${BASE}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(/realms\/workspace/, { timeout: 60_000 });
  await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
  await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS);
  await page.locator('#kc-login, input[type="submit"]').first().click();
  await page.waitForURL(url => url.toString().startsWith(BASE), { timeout: 60_000 });
}

test.describe('T001656: coaching-studio empty-customer fallback', () => {
  test('T1: /admin/coaching/studio requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/admin/coaching/studio`);
    await expect(page).not.toHaveURL(`${BASE}/admin/coaching/studio`);
  });

  test.describe('authenticated', () => {
    test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated coaching-studio checks');

    test('T2: "Neue Session" does not crash the Workspace when CUSTOMERS is empty', async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', err => pageErrors.push(err));

      await loginAsAdmin(page, '/admin/coaching/studio');
      await page.waitForURL(/\/admin\/coaching\/studio$/, { timeout: 60_000 });

      // TopBar "Session" button (always visible) and Dashboard "Neue Session"
      // button both call onNav("workspace", CUSTOMERS[0]) — with CUSTOMERS
      // empty, customer arrives as undefined and used to crash Workspace().
      const neueSession = page.getByRole('button', { name: /Neue Session/i }).first();
      await neueSession.waitFor({ state: 'visible', timeout: 30_000 });
      await neueSession.click();

      // Workspace screen renders — "Ebene 01" heading / .ws container.
      await expect(page.locator('.ws, text=Ebene 01').first()).toBeVisible({ timeout: 30_000 });

      expect(
        pageErrors.map(e => e.message),
        'no uncaught page error should fire when opening a session with an empty client list',
      ).toEqual([]);
    });
  });
});

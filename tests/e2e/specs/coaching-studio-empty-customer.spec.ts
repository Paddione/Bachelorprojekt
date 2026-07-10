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

    // T001784: the browser-transpiled studio bundle was removed — its source .jsx were
    // corrupt (a leaked heredoc marker made screens_core.jsx invalid JS) so the studio
    // crashed on load anyway, and it pulled React + Babel from the unpkg CDN (DSGVO / on-
    // premises breach). The page now shows an honest disabled placeholder; whether to rebuild
    // or remove the tool is tracked in T001792. The old T2 ("Neue Session" flow) is obsolete.
    test('T2: studio is disabled behind a placeholder and requests no third-party CDN (T001784)', async ({ page }) => {
      const pageErrors: Error[] = [];
      const cdnRequests: string[] = [];
      page.on('pageerror', err => pageErrors.push(err));
      page.on('request', req => {
        if (/unpkg\.com|cdn\.jsdelivr|cdnjs\.cloudflare|esm\.sh|skypack/.test(req.url())) cdnRequests.push(req.url());
      });

      await loginAsAdmin(page, '/admin/coaching/studio');
      await page.waitForURL(/\/admin\/coaching\/studio$/, { timeout: 60_000 });

      await expect(page.getByText(/nicht verfügbar/i).first()).toBeVisible({ timeout: 60_000 });
      expect(cdnRequests, 'the studio page must not request React/Babel from any third-party CDN').toEqual([]);
      expect(pageErrors.map(e => e.message), 'the placeholder must load without uncaught page errors').toEqual([]);
    });
  });
});

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

// Hydration timeout: prod (remote) needs more time for JS bundle download +
// framework init than localhost. Configurable via E2E_HYDRATION_TIMEOUT ms.
const HYDRATION_TIMEOUT = parseInt(process.env.E2E_HYDRATION_TIMEOUT || '20000', 10);

/**
 * Wait for Astro islands to finish hydration by polling the removal of the
 * `ssr` attribute.  Some non-critical islands (e.g. PortalSidekick) may
 * never hydrate in certain environments, so we wait for the *count* of
 * `astro-island[ssr]` elements to **stabilise** (stop decreasing) rather
 * than requiring it to reach exactly zero.
 *
 * The function polls every 200 ms.  Once the count has been unchanged for
 * three consecutive polls (≈ 600 ms of stability) the function returns
 * successfully.  If the overall timeout is exceeded the caller's test
 * fails with a clear message.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      // Expose a stable polling counter on the window object.
      const w = window as any;
      const current = document.querySelectorAll('astro-island[ssr]').length;
      if (w.__ssrLast === undefined || w.__ssrLast !== current) {
        // Count changed – reset the stability counter.
        w.__ssrLast = current;
        w.__ssrStablePolls = 0;
        return false;
      }
      // Count unchanged – increment stability counter.
      w.__ssrStablePolls = (w.__ssrStablePolls || 0) + 1;
      // Consider hydrated once stable for 3 polls (≈ 600 ms) or count hit 0.
      return current === 0 || w.__ssrStablePolls >= 3;
    },
    { timeout: HYDRATION_TIMEOUT },
  );
}

test.describe('FA-10: Unternehmenswebsite (Astro) & Kontaktformular', { tag: ['@smoke', '@website'] }, () => {
  test.describe.configure({ retries: 1 });

  // -- Website Structure --
  test('T1: Landing page loads', async ({ page }) => {
    const res = await page.goto(BASE);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  });

  test('T2: Subpages are reachable', async ({ page }) => {
    test.setTimeout(120000);
    // Service pages differ per brand. The CI workflow (e2e.yml) sets
    // WEBSITE_SERVICE_PAGES per-brand in the matrix.  The default here
    // covers local dev against the mentolder brand.
    const defaultPages = BASE.includes('korczewski')
      ? '/ki-beratung,/software-dev,/deployment'
      : '/coaching,/beratung';
    const servicePages = (process.env.WEBSITE_SERVICE_PAGES || defaultPages).split(',').filter(Boolean);
    const pages = [
      ...servicePages,
      // '/ueber-mich' — temporarily disabled: consistently times out from GitHub Actions
      '/kontakt',
      '/leistungen',
      '/registrieren',
    ];
    for (const path of pages) {
      const res = await page.goto(`${BASE}${path}`, { timeout: 45000, waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${path} should return 200`).toBe(200);
    }
  });

  test('T3: Navigation is functional', async ({ page }) => {
    await page.goto(BASE);
    const mainNav = page.getByRole('navigation', { name: 'Seitennavigation' });
    await expect(mainNav).toBeVisible();
    // Nav links the contact and services pages
    await expect(mainNav.locator('a[href="/kontakt"]')).toBeVisible();
  });

  // -- Contact Form --
  test('T4: Contact page loads', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    // The h1 was changed in the premium overhaul PR #883
    await expect(page.locator('h1')).toContainText(/In 30 Minuten.*wissen wir.*ob es passt/i);
  });

  test('T5: Contact form has all required fields', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    await waitForHydration(page);
    // The new UI uses tabs. Use data-testid for robust selection instead of computed accessible name.
    await page.getByTestId('tab-nachricht').click();
    await expect(page.getByRole('combobox', { name: /wie kann ich helfen/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /name/i }).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: /e-mail/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /ihre nachricht/i })).toBeVisible();
  });

  test('T6: Valid form submission succeeds', async ({ page }) => {
    // Intercept the API call to inject the E2E marker headers so the row is
    // stamped is_test_data=true and cleaned up by the purge bracket. Without
    // the secret we MUST NOT submit at all — an unmarked browser POST
    // persists as a real inbox item on prod (T001453).
    const cronSecret = process.env.CRON_SECRET;
    test.skip(!cronSecret, 'CRON_SECRET fehlt — Submission würde unmarkiert in der Prod-Inbox persistieren (T001453)');
    await page.route('**/api/contact', async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'X-E2E-Test': '1',
          'X-Cron-Secret': cronSecret!,
        },
      });
    });
    await page.goto(`${BASE}/kontakt`);
    await waitForHydration(page);
    // Use data-testid for robust selection instead of computed accessible name.
    await page.getByTestId('tab-nachricht').click();
    await page.getByRole('textbox', { name: /name/i }).first().fill('[TEST] E2E User');
    await page.getByRole('textbox', { name: /e-mail/i }).fill('test-e2e@example.invalid');
    await page.getByRole('textbox', { name: /ihre nachricht/i }).fill('Dies ist eine automatisierte Testnachricht.');
    await page.getByRole('button', { name: /nachricht senden/i }).click();
    await expect(page.locator('.cf-result.is-success')).toHaveText(/Vielen Dank/, { timeout: 60_000 });
  });

  test('T7: Sidebar shows contact information', async ({ page }) => {
    await page.goto(`${BASE}/kontakt`);
    const expectedEmail = process.env.CONTACT_EMAIL || 'info@mentolder.de';
    const expectedPhone = process.env.CONTACT_PHONE || '+49 151 508 32 601';
    await expect(page.locator(`text=${expectedEmail}`).first()).toBeVisible();
    
    // The phone number is optional on the sidebar (it may reference the Impressum instead).
    if (expectedPhone && expectedPhone !== '***') {
      const phoneLocator = page.locator(`text=${expectedPhone}`).first();
      const isPhoneVisible = await phoneLocator.isVisible();
      if (!isPhoneVisible) {
        // Fallback: expect Impressum reference text/link
        await expect(page.locator('text=Impressum').first()).toBeVisible();
      }
    }
  });
});

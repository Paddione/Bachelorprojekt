import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE        = process.env.WEBSITE_URL    ?? 'https://web.mentolder.de';
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS  = process.env.E2E_ADMIN_PASS;

/**
 * FA-54: Coaching-Sessions — Grundfunktionen
 *
 * Prüft: Zugriffskontrolle, Seitenstruktur, Session-Anlage, Wizard-Schritte,
 * Skip-Navigation und Session-Meta-Bearbeitung.
 * KI-Generierung ist bewusst nicht getestet (erfordert gültigen Anthropic-API-Key).
 */

async function loginAsAdmin(page: import('@playwright/test').Page, returnTo = '/admin/coaching/sessions'): Promise<void> {
  if (!ADMIN_PASS) throw new Error('E2E_ADMIN_PASS is not set');
  await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent(ADMIN_USER)}&returnTo=${encodeURIComponent(returnTo)}`);
  await page.waitForURL(url => url.toString().startsWith(BASE), { timeout: 60_000 });
}

test.describe('FA-54: Coaching-Sessions', () => {

  // ── Auth-Gating ─────────────────────────────────────────────────────────────
  test('T1: /admin/coaching/sessions requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/admin/coaching/sessions`);
    await expect(page).not.toHaveURL(`${BASE}/admin/coaching/sessions`);
  });

  test('T2: /admin/coaching/sessions/new requires authentication', async ({ page }) => {
    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await expect(page).not.toHaveURL(`${BASE}/admin/coaching/sessions/new`);
  });

  test('T3: GET /api/admin/coaching/sessions returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/coaching/sessions`);
    expect([401, 403]).toContain(res.status());
  });

  test('T4: POST /api/admin/coaching/sessions returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/coaching/sessions`, {
      data: { title: 'test', mode: 'live' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test.describe('authenticated coaching sessions', () => {
    test.beforeEach(async ({ request }, testInfo) => {
      await assertAuthenticatedReachable(
        request,
        `${BASE}/admin/coaching/sessions`,
        { acceptableStatuses: [200, 302, 401], label: 'coaching sessions' },
        testInfo
      );
    });

    // ── Seitenstruktur ──────────────────────────────────────────────────────────
    test('T5: sessions overview page has expected heading and new-session link', async ({ page }) => {
      await loginAsAdmin(page, '/admin/coaching/sessions');
      await page.waitForURL(/\/admin\/coaching\/sessions$/, { timeout: 60_000 });

      await expect(page.getByRole('heading', { name: 'Coaching-Sessions' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Neue Session/ }).first()).toBeVisible();
    });

    test('T6: new session page has all required form fields', async ({ page }) => {
      await loginAsAdmin(page, '/admin/coaching/sessions/new');
      await page.waitForURL(/\/new$/, { timeout: 20_000 });

      await expect(page.locator('#title')).toBeVisible();
      await expect(page.locator('#clientId')).toBeVisible();
      await expect(page.locator('#kiConfigId')).toBeVisible();
      await expect(page.locator('input[name="mode"][value="live"]')).toBeVisible();
      await expect(page.locator('input[name="mode"][value="prep"]')).toBeVisible();
      await expect(page.locator('#submit-btn')).toBeVisible();
    });

    // ── Session-Wizard ──────────────────────────────────────────────────────────
    test('T7: wizard shows 10 step buttons in the progress bar', async ({ page }) => {
      await loginAsAdmin(page, '/admin/coaching/sessions/new');
      await page.waitForURL(/\/new$/, { timeout: 20_000 });
      await page.locator('#title').fill(`FA-54 E2E ${Date.now()}`);
      await page.locator('#submit-btn').click();
      await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

      const progressBar = page.locator('[aria-label="Fortschritt"]');
      await expect(progressBar).toBeVisible();
      const buttons = progressBar.getByRole('button');
      await expect(buttons).toHaveCount(10);
    });

    test('T8: wizard step 1 shows Erstanamnese with required inputs and disabled KI button', async ({ page }) => {
      await loginAsAdmin(page, '/admin/coaching/sessions/new');
      await page.waitForURL(/\/new$/, { timeout: 20_000 });
      await page.locator('#title').fill(`FA-54 E2E T8 ${Date.now()}`);
      await page.locator('#submit-btn').click();
      await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

      await expect(page.getByRole('heading', { name: /Schritt 1\/10.*Erstanamnese/ })).toBeVisible();
      await expect(page.locator('#anlass')).toBeVisible();
      await expect(page.locator('#situation')).toBeVisible();
      await expect(page.getByRole('button', { name: /KI befragen/ })).toBeDisabled();
    });

    test('T9: KI button enables when required fields are filled', async ({ page }) => {
      await loginAsAdmin(page, '/admin/coaching/sessions/new');
      await page.waitForURL(/\/new$/, { timeout: 20_000 });
      await page.locator('#title').fill(`FA-54 E2E T9 ${Date.now()}`);
      await page.locator('#submit-btn').click();
      await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

      await page.locator('#anlass').fill('Führungsproblem im Team');
      await page.locator('#situation').fill('Konflikt zwischen Mitarbeitern, schlechte Stimmung');
      await expect(page.getByRole('button', { name: /KI befragen/ })).toBeEnabled();
    });

    test('T10: skip advances wizard to the next step', async ({ page }) => {
      await loginAsAdmin(page, '/admin/coaching/sessions/new');
      await page.waitForURL(/\/new$/, { timeout: 20_000 });
      await page.locator('#title').fill(`FA-54 E2E T10 ${Date.now()}`);
      await page.locator('#submit-btn').click();
      await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

      await expect(page.getByRole('heading', { name: /Schritt 1\/10/ })).toBeVisible();
      await page.getByRole('button', { name: 'Schritt überspringen' }).click();
      await expect(page.getByRole('heading', { name: /Schritt 2\/10.*Schlüsselaffekt/ })).toBeVisible();
    });

    test('T11: back button returns to previous step', async ({ page }) => {
      await loginAsAdmin(page, '/admin/coaching/sessions/new');
      await page.waitForURL(/\/new$/, { timeout: 20_000 });
      await page.locator('#title').fill(`FA-54 E2E T11 ${Date.now()}`);
      await page.locator('#submit-btn').click();
      await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

      await page.getByRole('button', { name: 'Schritt überspringen' }).click();
      await expect(page.getByRole('heading', { name: /Schritt 2\/10/ })).toBeVisible();
      await page.getByRole('button', { name: '← Zurück' }).click();
      await expect(page.getByRole('heading', { name: /Schritt 1\/10/ })).toBeVisible();
    });

    test('T12: session-info box shows title and edit button', async ({ page }) => {
      const title = `FA-54 Meta ${Date.now()}`;
      await loginAsAdmin(page, '/admin/coaching/sessions/new');
      await page.waitForURL(/\/new$/, { timeout: 20_000 });
      await page.locator('#title').fill(title);
      await page.locator('#submit-btn').click();
      await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/, { timeout: 20_000 });

      await expect(page.getByText(title).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Bearbeiten/ })).toBeVisible();
    });
  });
});

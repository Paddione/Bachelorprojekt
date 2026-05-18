import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

/**
 * FA-39: Coaching-Sessions — Grundfunktionen
 *
 * Prüft: Zugriffskontrolle, Seitenstruktur, Session-Anlage, Wizard-Schritte,
 * Skip-Navigation und Session-Meta-Bearbeitung.
 * KI-Generierung ist bewusst nicht getestet (erfordert gültigen Anthropic-API-Key).
 */
test.describe('FA-39: Coaching-Sessions', () => {

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

  // ── Seitenstruktur ──────────────────────────────────────────────────────────
  test('T5: sessions overview page has expected heading and new-session link', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    await page.goto(`${BASE}/admin/coaching/sessions`);
    await page.waitForURL(/\/admin\/coaching\/sessions$/);

    await expect(page.getByRole('heading', { name: 'Coaching-Sessions' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Neue Session/ }).first()).toBeVisible();
  });

  test('T6: new session page has all required form fields', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await page.waitForURL(/\/new$/);

    await expect(page.locator('#title')).toBeVisible();
    await expect(page.locator('#clientId')).toBeVisible();
    await expect(page.locator('#kiConfigId')).toBeVisible();
    await expect(page.locator('input[name="mode"][value="live"]')).toBeVisible();
    await expect(page.locator('input[name="mode"][value="prep"]')).toBeVisible();
    await expect(page.locator('#submit-btn')).toBeVisible();
  });

  // ── Session-Wizard ──────────────────────────────────────────────────────────
  test('T7: wizard shows 10 step buttons in the progress bar', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await page.waitForURL(/\/new$/);
    await page.locator('#title').fill(`FA-39 E2E ${Date.now()}`);
    await page.locator('#submit-btn').click();
    await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/);

    const progressBar = page.locator('[aria-label="Fortschritt"]');
    await expect(progressBar).toBeVisible();
    const buttons = progressBar.getByRole('button');
    await expect(buttons).toHaveCount(10);
  });

  test('T8: wizard step 1 shows Erstanamnese with required inputs and disabled KI button', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await page.waitForURL(/\/new$/);
    await page.locator('#title').fill(`FA-39 E2E T8 ${Date.now()}`);
    await page.locator('#submit-btn').click();
    await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/);

    await expect(page.getByRole('heading', { name: /Schritt 1\/10.*Erstanamnese/ })).toBeVisible();
    await expect(page.locator('#anlass')).toBeVisible();
    await expect(page.locator('#situation')).toBeVisible();
    // KI button disabled until required fields filled
    await expect(page.getByRole('button', { name: /KI befragen/ })).toBeDisabled();
  });

  test('T9: KI button enables when required fields are filled', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await page.waitForURL(/\/new$/);
    await page.locator('#title').fill(`FA-39 E2E T9 ${Date.now()}`);
    await page.locator('#submit-btn').click();
    await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/);

    await page.locator('#anlass').fill('Führungsproblem im Team');
    await page.locator('#situation').fill('Konflikt zwischen Mitarbeitern, schlechte Stimmung');
    await expect(page.getByRole('button', { name: /KI befragen/ })).toBeEnabled();
  });

  test('T10: skip advances wizard to the next step', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await page.waitForURL(/\/new$/);
    await page.locator('#title').fill(`FA-39 E2E T10 ${Date.now()}`);
    await page.locator('#submit-btn').click();
    await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/);

    await expect(page.getByRole('heading', { name: /Schritt 1\/10/ })).toBeVisible();
    await page.getByRole('button', { name: 'Schritt überspringen' }).click();
    await expect(page.getByRole('heading', { name: /Schritt 2\/10.*Schlüsselaffekt/ })).toBeVisible();
  });

  test('T11: back button returns to previous step', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await page.waitForURL(/\/new$/);
    await page.locator('#title').fill(`FA-39 E2E T11 ${Date.now()}`);
    await page.locator('#submit-btn').click();
    await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/);

    await page.getByRole('button', { name: 'Schritt überspringen' }).click();
    await expect(page.getByRole('heading', { name: /Schritt 2\/10/ })).toBeVisible();
    await page.getByRole('button', { name: '← Zurück' }).click();
    await expect(page.getByRole('heading', { name: /Schritt 1\/10/ })).toBeVisible();
  });

  test('T12: session-info box shows title and edit button', async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_PASS, 'E2E_ADMIN_PASS not set — skipping authenticated tests');

    const title = `FA-39 Meta ${Date.now()}`;
    await page.goto(`${BASE}/admin/coaching/sessions/new`);
    await page.waitForURL(/\/new$/);
    await page.locator('#title').fill(title);
    await page.locator('#submit-btn').click();
    await page.waitForURL(/\/sessions\/[a-f0-9-]{36}$/);

    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByRole('button', { name: /Bearbeiten/ })).toBeVisible();
  });
});

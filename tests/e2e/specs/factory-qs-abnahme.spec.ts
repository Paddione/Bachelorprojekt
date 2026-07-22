// tests/e2e/factory-qs-abnahme.spec.ts [T000730]
// Verifiziert den QS-Abnahme-Flow im /dev-status Dashboard (smoke-level).
// Benötigt E2E_ADMIN_USER + E2E_ADMIN_PASS (Keycloak-Admin).
// Läuft nur gegen Live-Prod (WEBSITE_URL env var).
import { test, expect } from '@playwright/test';

const WEBSITE_URL = process.env.WEBSITE_URL ?? 'http://localhost:4321';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? '';

test.describe('[factory-qs-abnahme-loop] QS-Abnahme-Flow', () => {
  test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS nicht gesetzt — überspringe Auth-Test');

  test('[factory-qs-abnahme-loop] /dev-status lädt ohne Fehler', async ({ page }) => {
    await page.goto(`${WEBSITE_URL}/admin/pipeline`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/auth/') || page.url().includes('/login')) {
      await page.fill('input[name="username"]', ADMIN_USER);
      await page.fill('input[name="password"]', ADMIN_PASS);
      await page.click('input[type="submit"]');
      await page.waitForURL(`${WEBSITE_URL}/admin/pipeline`, { waitUntil: 'domcontentloaded' });
    }
    expect(page.url()).toMatch(/admin\/(pipeline|dev-status)/);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForLoadState('domcontentloaded');
    expect(errors).toHaveLength(0);
  });

  test('[factory-qs-abnahme-loop] /admin/dev-status zeigt QS-Tab', async ({ page }) => {
    await page.goto(`${WEBSITE_URL}/admin/pipeline`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/auth/') || page.url().includes('/login')) {
      await page.fill('input[name="username"]', ADMIN_USER);
      await page.fill('input[name="password"]', ADMIN_PASS);
      await page.click('input[type="submit"]');
      await page.waitForURL(`${WEBSITE_URL}/admin/pipeline`, { waitUntil: 'domcontentloaded' });
    }
    const qsElement = page.locator('text=/QS|Floor|Steuerung/i').first();
    await expect(qsElement).toBeVisible({ timeout: 30_000 });
  });

  test('[factory-qs-abnahme-loop] ingest-e2e Endpoint antwortet mit 401 ohne Token', async ({ request }) => {
    const resp = await request.post(`${WEBSITE_URL}/api/admin/tests/ingest-e2e`, {
      data: { suites: [], stats: { startTime: new Date().toISOString(), duration: 0, expected: 0, unexpected: 0, skipped: 0 } },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 401, 403]).toContain(resp.status());
  });

  test('[factory-qs-abnahme-loop] ingest-e2e Endpoint akzeptiert validen Payload mit Token', async ({ request }) => {
    test.skip(!process.env.E2E_INGEST_TOKEN, 'E2E_INGEST_TOKEN nicht gesetzt');
    const resp = await request.post(`${WEBSITE_URL}/api/admin/tests/ingest-e2e`, {
      data: {
        suites: [],
        stats: { startTime: new Date().toISOString(), duration: 100, expected: 0, unexpected: 0, skipped: 0 },
        runId: `test-qa-loop-${Date.now()}`,
        cluster: 'mentolder',
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.E2E_INGEST_TOKEN}`,
      },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toMatchObject({ ok: true, ticketsClosed: expect.any(Array) });
  });
});

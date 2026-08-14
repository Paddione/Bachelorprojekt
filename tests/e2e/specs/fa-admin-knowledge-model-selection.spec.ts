import { test, expect } from '@playwright/test';
import { loginViaE2E } from '../lib/auth';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await loginViaE2E(page, BASE, ADMIN_USER, '/admin/wissen');
}

test.describe('Wissensquellen admin — Embedding Model Selection', { tag: ['@admin'] }, () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/wissen`,
      { acceptableStatuses: [200, 302, 401], label: 'admin wissen' },
      testInfo
    );
  });

  test('verify embedding model selection in Web-Quelle modal and create bge-m3 collection', async ({ page }) => {
    await loginAsAdmin(page);

    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Einlesen' }).click();
    await page.getByRole('button', { name: '+ Web-Quelle' }).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-web-crawl-modal')));

    // Verify modal is open and label is present
    const label = page.getByText('Einbettungsmodell');
    await expect(label).toBeVisible({ timeout: 15_000 });

    const select = page.locator('select').filter({ has: page.locator('option[value="bge-m3"]') }).first();
    await expect(select).toBeAttached();

    // Verify options
    const options = select.locator('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveAttribute('value', 'voyage-multilingual-2');
    await expect(options.nth(0)).toHaveText('Voyage (Cloud)');
    await expect(options.nth(1)).toHaveAttribute('value', 'bge-m3');
    await expect(options.nth(1)).toHaveText('Lokal (bge-m3)');

    // Select bge-m3
    await select.selectOption('bge-m3');

    const stamp = `e2e-bgem3-${Date.now()}`;
    const dialog = page.locator('dialog[open]');
    await dialog.locator('input[placeholder*="Website"]').or(dialog.locator('input[type="text"]')).first().fill(stamp);
    await dialog.locator('input[type="url"]').fill('https://example.com');

    // Intercept the API call to verify embeddingModel is sent correctly
    const [response] = await Promise.all([
      page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST'
      ),
      dialog.getByRole('button', { name: 'Anlegen' }).click(),
    ]);

    expect(response.status()).toBe(201);
    const bodyText = await response.text().catch(() => '');
    const created = bodyText ? JSON.parse(bodyText) : null;
    if (created?.embedding_model) {
      expect(created.embedding_model).toBe('bge-m3');
    }

    // Cleanup via UI
    page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/admin/wissen`);
    await page.getByRole('button', { name: 'Sammlungen' }).click();
    const row = page.getByRole('row', { name: new RegExp(stamp) });
    if (await row.isVisible()) {
      await row.getByRole('button', { name: 'Löschen' }).click();
    }
    await expect(row).not.toBeVisible({ timeout: 60_000 });
  });
});

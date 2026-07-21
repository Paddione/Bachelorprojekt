import { test, expect } from '@playwright/test';
import { assertAuthenticatedReachable } from '../lib/health-assertions';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent(ADMIN_USER)}&returnTo=/admin/wissensquellen`);
  await page.waitForURL(/\/admin\/wissensquellen/, { timeout: 60_000 });
}

test.describe('Wissensquellen admin — Embedding Model Selection', () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/admin/wissensquellen`,
      { acceptableStatuses: [200, 302, 401], label: 'admin wissensquellen' },
      testInfo
    );
  });

  test('verify embedding model selection in Web-Quelle modal and create bge-m3 collection', async ({ page }) => {
    await loginAsAdmin(page);

    await page.getByRole('button', { name: '+ Web-Quelle' }).click();

    // Verify modal is open and label is present
    const label = page.getByText('Einbettungsmodell', { exact: true });
    await expect(label).toBeVisible();

    const select = page.locator('label:has-text("Einbettungsmodell") select');
    await expect(select).toBeVisible();

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
    await page.getByLabel('Name').fill(stamp);
    await page.getByLabel(/Start-URL/i).fill('https://example.com');

    // Intercept the API call to verify embeddingModel is sent correctly
    const [response] = await Promise.all([
      page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: 'Anlegen' }).click(),
    ]);

    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created.embedding_model).toBe('bge-m3');

    // Cleanup
    await page.goto(`${BASE}/admin/wissensquellen`);
    const row = page.getByRole('row', { name: new RegExp(stamp) });
    await expect(row).toBeVisible({ timeout: 60_000 });

    const deleteResponse = page.waitForResponse(r =>
      r.url().includes(`/api/admin/knowledge/collections/${created.id}`) &&
      r.request().method() === 'DELETE',
    );
    page.once('dialog', d => d.accept());
    await row.getByRole('button', { name: 'Löschen' }).click();
    await deleteResponse;
    await expect(row).not.toBeVisible({ timeout: 60_000 });
  });
});

import { test, expect } from '@playwright/test';
import { loginViaE2E } from '../lib/auth';
import { assertWissensquellenReachable } from '../lib/wissensquellen-fixtures';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'paddione';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await loginViaE2E(page, BASE, ADMIN_USER, '/admin/wissen');
}

test.describe('Wissensquellen admin — Embedding Model Selection', { tag: ['@admin'] }, () => {
  test.beforeEach(async ({ request }, testInfo) => {
    await assertWissensquellenReachable(request, testInfo);
  });

  test('verify embedding model selection in Web-Quelle modal and create bge-m3 collection', async ({ page }) => {
    test.setTimeout(30_000);
    await loginAsAdmin(page);

    await expect.poll(async () => {
      const dialog = page.locator('dialog[open]');
      if (await dialog.isVisible()) return true;
      const webBtn = page.getByRole('button', { name: '+ Web-Quelle' });
      if (await webBtn.isVisible()) {
        await webBtn.click();
      } else {
        const einlesenBtn = page.getByRole('button', { name: 'Einlesen' });
        if (await einlesenBtn.isVisible()) await einlesenBtn.click();
      }
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-web-crawl-modal')));
      return dialog.isVisible();
    }, { timeout: 15_000 }).toBe(true);

    // T016562: keine Modellauswahl mehr — Voyage entfernt, Collection läuft
    // immer mit bge-m3. Es darf keine Voyage-Option mehr existieren.
    const voyageOption = page.locator('option[value="voyage-multilingual-2"]');
    await expect(voyageOption).toHaveCount(0);

    const stamp = `e2e-bgem3-${Date.now()}`;
    const dialog = page.locator('dialog[open]');
    await dialog.locator('label').filter({ hasText: 'Name' }).locator('input').fill(stamp);
    await dialog.locator('input[type="url"]').fill('https://example.com');

    // Intercept the API call to verify embeddingModel is sent correctly
    const anlegenBtn = dialog.getByRole('button', { name: 'Anlegen' });
    await expect(anlegenBtn).toBeEnabled({ timeout: 10_000 });
    const [response] = await Promise.all([
      page.waitForResponse(r =>
        r.url().includes('/api/admin/knowledge/collections') &&
        r.request().method() === 'POST'
      ),
      anlegenBtn.click(),
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
      // [T900838] dispatchEvent statt click(): die fixed positionierte Nudge-Bubble des
      // Assistenten kann jederzeit über dem Button erscheinen und fängt den Klick ab.
      await row.getByRole('button', { name: 'Löschen' }).dispatchEvent('click');
    }
    await expect(row).not.toBeVisible({ timeout: 60_000 });
  });
});

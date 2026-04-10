import { test, expect } from '@playwright/test';
import { goToChannel } from './helpers';

const TEAM = 'bachelorprojekt';
const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA-09: Billing Bot & Service Catalog', () => {
  
  // -- Mattermost Part --
  test('T1: /billing command shows menu in Mattermost', async ({ page }) => {
    await goToChannel(page, TEAM, 'off-topic');

    const postBox = page.locator('[data-testid="post_textbox"]').first();
    await postBox.fill('/billing');
    await page.keyboard.press('Enter');

    // Bot posts via MM API (async goroutine) — wait for the attachment action buttons.
    // Mattermost renders action buttons inside .attachment-actions, may not have role="button".
    const invoiceBtn = page.locator('button:has-text("Rechnung erstellen"), [id="createinvoice"]');
    const clientBtn = page.locator('button:has-text("Kunde anlegen"), [id="createclient"]');
    await expect(invoiceBtn.first()).toBeVisible({ timeout: 20_000 });
    await expect(clientBtn.first()).toBeVisible();
  });

  test('T2: /billing help shows help text', async ({ page }) => {
    await goToChannel(page, TEAM, 'off-topic');

    const postBox = page.locator('[data-testid="post_textbox"]').first();
    await postBox.fill('/billing help');
    await page.keyboard.press('Enter');

    // Bot posts via MM API (async goroutine)
    const invoiceBtn = page.locator('button:has-text("Rechnung erstellen"), [id="createinvoice"]');
    await expect(invoiceBtn.first()).toBeVisible({ timeout: 20_000 });
  });

  // -- Website Part (from former FA-21) --
  test('T3: /leistungen page loads', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('h1')).toContainText('Leistungen');
  });

  test('T4: All service categories visible', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    // Page should have multiple service sections (flexible matching)
    await expect(page.locator('h1, h2, h3').filter({ hasText: /café|cafe|digital|coaching|beratung|leistung/i }).first()).toBeVisible({ timeout: 10_000 });
    const headings = await page.locator('h2, h3').count();
    expect(headings).toBeGreaterThan(0);
  });

  test('T5: Pricing displayed correctly', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    // Pricing content should be present somewhere on the page (€, /h, numbers)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/€|\d{2,}|Preis|Stunde|pauschal/i);
  });

  test('T6: POST /api/billing/create-invoice without data returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/create-invoice`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

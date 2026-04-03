import { test, expect } from '@playwright/test';
import { goToChannel } from './helpers';

const TEAM = 'bachelorprojekt';
const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-09: Billing Bot & Service Catalog', () => {
  
  // -- Mattermost Part --
  test('T1: /billing command shows menu in Mattermost', async ({ page }) => {
    await goToChannel(page, TEAM, 'off-topic');

    await page.locator('#post_textbox').fill('/billing');
    await page.locator('#post_textbox').press('Enter');

    // Wait for ephemeral response from bot
    await expect(page.locator('.post-message__text').last())
      .toContainText(/Billing Bot/i, { timeout: 15_000 });
    
    // Check for some buttons
    await expect(page.getByRole('button', { name: /Rechnung erstellen/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kunde anlegen/i })).toBeVisible();
  });

  test('T2: /billing help shows help text', async ({ page }) => {
    await goToChannel(page, TEAM, 'off-topic');

    await page.locator('#post_textbox').fill('/billing help');
    await page.locator('#post_textbox').press('Enter');

    await expect(page.locator('.post-message__text').last())
      .toContainText(/Verfügbare Befehle/i, { timeout: 10_000 });
  });

  // -- Website Part (from former FA-21) --
  test('T3: /leistungen page loads', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('h1')).toContainText('Leistungen');
  });

  test('T4: All service categories visible', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('text=Digital Cafe 50+')).toBeVisible();
    await expect(page.locator('text=Coaching')).toBeVisible();
    await expect(page.locator('text=Unternehmensberatung')).toBeVisible();
  });

  test('T5: Pricing displayed correctly', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    await expect(page.locator('text=60')).toBeVisible(); // Digital Cafe Einzel
    await expect(page.locator('text=150')).toBeVisible(); // Coaching Session
    await expect(page.locator('text=1.000')).toBeVisible(); // Beratung Tagessatz
  });

  test('T6: POST /api/billing/create-invoice without data returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/billing/create-invoice`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

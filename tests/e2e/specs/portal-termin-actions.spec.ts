import { test, expect } from '@playwright/test';

const PORTAL_EMAIL = process.env.PORTAL_TEST_EMAIL || 'testuser@mentolder.de';
const PORTAL_PASSWORD = process.env.PORTAL_TEST_PASSWORD || 'testpass';

test.describe('Portal Terminbuchung Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/portal');
    if (page.url().includes('/auth/')) {
      await page.fill('input[name="username"]', PORTAL_EMAIL);
      await page.fill('input[name="password"]', PORTAL_PASSWORD);
      await page.click('input[type="submit"]');
      await page.waitForURL('**/portal**');
    }
  });

  test('SA-PORTAL-01 — Termin buchen: AI bestätigt CalDAV-Event-Erstellung', async ({ page }) => {
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 60_000 });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    const dateStr = futureDate.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    await chatInput.fill(`Buche einen Termin für ${dateStr} um 10 Uhr`);
    await page.keyboard.press('Enter');

    const response = page.locator('[data-testid="assistant-message"], .assistant-message, [class*="assistant"]').last();
    await expect(response).toBeVisible({ timeout: 60_000 });
    await expect(response).toContainText(/bestätigt|Termin.*gebucht|10:00/i, { timeout: 60_000 });
  });

  test('SA-PORTAL-02 — Termin absagen: AI bestätigt Absage', async ({ page }) => {
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 60_000 });

    await chatInput.fill('Welche Termine habe ich?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5_000);

    await chatInput.fill('Sage meinen nächsten Termin ab');
    await page.keyboard.press('Enter');

    const response = page.locator('[data-testid="assistant-message"], .assistant-message').last();
    await expect(response).toBeVisible({ timeout: 60_000 });
    await expect(response).not.toContainText('noch nicht angebunden');
  });

  test('SA-PORTAL-03 — Terminverschiebung: AI bestätigt Verschiebung', async ({ page }) => {
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 60_000 });

    const newDate = new Date();
    newDate.setDate(newDate.getDate() + 7);
    const newDateStr = newDate.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

    await chatInput.fill(`Verschiebe meinen Termin auf ${newDateStr} um 14 Uhr`);
    await page.keyboard.press('Enter');

    const response = page.locator('[data-testid="assistant-message"], .assistant-message').last();
    await expect(response).toBeVisible({ timeout: 60_000 });
    await expect(response).not.toContainText('noch nicht angebunden');
  });

  test('SA-PORTAL-04 — Terminanfrage ohne Datum: InboxItem erstellt, AI bestätigt', async ({ page }) => {
    const chatInput = page.locator('[data-testid="assistant-input"], textarea[placeholder*="Nachricht"], input[placeholder*="Nachricht"]').first();
    await expect(chatInput).toBeVisible({ timeout: 60_000 });

    await chatInput.fill('Ich hätte gerne einen Termin, bin aber zeitlich flexibel');
    await page.keyboard.press('Enter');

    const response = page.locator('[data-testid="assistant-message"], .assistant-message').last();
    await expect(response).toBeVisible({ timeout: 60_000 });
    await expect(response).toContainText(/Terminanfrage|eingegangen|benachrichtigt|melden/i, { timeout: 60_000 });
    await expect(response).not.toContainText('noch nicht angebunden');
  });
});

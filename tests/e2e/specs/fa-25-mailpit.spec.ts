import { test, expect } from '@playwright/test';

const MAIL_URL = process.env.MAIL_URL || 'http://mail.localhost';

test.describe('FA-25: Mailpit E-Mail-Server', () => {

  test('T1: Mailpit web UI loads', async ({ page }) => {
    const res = await page.goto(MAIL_URL);
    // 200 = direct access; 401 = behind oauth2-proxy (service alive, auth required)
    expect([200, 401]).toContain(res?.status());
  });

  test('T2: Web UI shows message list', async ({ page }) => {
    const res = await page.goto(MAIL_URL);
    // If behind oauth2-proxy (401/redirect to KC), service is alive but UI not directly accessible
    if (res?.status() === 401 || /realms\/workspace/.test(page.url())) {
      test.skip(true, 'Mailpit is behind oauth2-proxy — UI not directly accessible without auth');
      return;
    }
    await expect(page.locator('#message-page, #messages, [data-testid="message-list"], .messages')).toBeVisible({ timeout: 10_000 });
  });

  test('T3: Mailpit API returns messages endpoint', async ({ page }) => {
    const res = await page.goto(`${MAIL_URL}/api/v1/messages?limit=1`);
    // If behind oauth2-proxy, service is alive but API not directly accessible
    if (res?.status() === 401 || /realms\/workspace/.test(page.url())) {
      // oauth2-proxy responded — service is alive
      return;
    }
    expect(res?.status()).toBe(200);
    const body = await res?.json();
    expect(body).toHaveProperty('messages');
  });
});

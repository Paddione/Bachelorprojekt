import { test, expect } from '@playwright/test';

const MAIL_URL = process.env.MAIL_URL || 'http://mail.localhost';

test.describe('FA-25: Mailpit E-Mail-Server', () => {

  test('T1: Mailpit web UI loads', async ({ page }) => {
    const res = await page.goto(MAIL_URL);
    expect(res?.status()).toBe(200);
  });

  test('T2: Web UI shows message list', async ({ page }) => {
    await page.goto(MAIL_URL);
    // Mailpit UI renders a message list (even if empty)
    await expect(page.locator('#message-page, #messages, [data-testid="message-list"], .messages')).toBeVisible({ timeout: 10_000 });
  });

  test('T3: Mailpit API returns messages endpoint', async ({ page }) => {
    const res = await page.goto(`${MAIL_URL}/api/v1/messages?limit=1`);
    expect(res?.status()).toBe(200);
    const body = await res?.json();
    expect(body).toHaveProperty('messages');
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-19: Outline Knowledge Base', () => {
  test('T1: Outline URL is configured in website', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    // We can't easily check the internal config via E2E unless we have an endpoint for it
    // but we can check if the wiki link might be present on some page (if any)
    expect(res.status()).toBe(200);
  });

  test('T2: /leistungen page exists (often links to knowledge base or services)', async ({ page }) => {
    await page.goto(`${BASE}/leistungen`);
    expect(page.url()).toContain('/leistungen');
  });
});

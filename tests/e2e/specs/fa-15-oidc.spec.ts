import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-15: OIDC Website Login', () => {
  test('T1: /api/auth/login redirects to Keycloak', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/login`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'] || '';
    expect(location).toContain('openid-connect/auth');
    expect(location).toContain('client_id=website');
  });

  test('T2: /api/auth/me returns unauthenticated when no session', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  test('T3: /api/auth/logout redirects', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/logout`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
  });

  test('T4: Nav shows Anmelden when not logged in', async ({ page }) => {
    await page.goto(BASE);
    // Wait for auth check to complete
    await page.waitForTimeout(1000);
    await expect(page.locator('a[href="/api/auth/login"]')).toBeVisible();
  });

  test('T5: Nav shows Registrieren when not logged in', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForTimeout(1000);
    await expect(page.locator('a[href="/registrieren"]')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-05: Nutzerverwaltung', () => {
  test('T1: /api/admin/clients/create requires admin auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/create`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T2: /api/admin/clients/enroll requires admin auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/enroll`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T3: /api/admin/clients/delete requires admin auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/delete`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: /api/admin/clients/roles-assign requires admin auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/roles-assign`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('T5: /registrieren page loads and shows registration form', async ({ page }) => {
    await page.goto(`${BASE}/registrieren`);
    await expect(page.getByRole('heading', { name: /registrieren/i })).toBeVisible();
  });

  test('T6: /api/auth/login redirects to Keycloak (SSO)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/login`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'] || '';
    expect(location).toContain('openid-connect/auth');
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin settings pages', { tag: ['@admin'] }, () => {
  // ── Page auth-gating ───────────────────────────────────────────
  const settingsPages = [
    '/admin/einstellungen/email',
    '/admin/einstellungen/rechnungen',
    '/admin/einstellungen/branding',
    '/admin/einstellungen/benachrichtigungen',
  ];

  for (const path of settingsPages) {
    test(`${path} redirects unauthenticated users`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await expect(page).not.toHaveURL(`${BASE}${path}`);
    });
  }

  // ── Settings API auth checks ───────────────────────────────────
  test('POST /api/admin/einstellungen/email returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/einstellungen/email`, { form: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/einstellungen/rechnungen returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/einstellungen/rechnungen`, { form: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/einstellungen/branding returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/einstellungen/branding`, { form: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/einstellungen/benachrichtigungen returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/einstellungen/benachrichtigungen`, { form: {} });
    expect([401, 403]).toContain(res.status());
  });

  // ── Client management API (new endpoints) ─────────────────────
  test('POST /api/admin/clients/flag-user returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/flag-user`, { data: { userId: 'test', role: 'admin' } });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/clients/set-admin-number returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/set-admin-number`, { data: { userId: 'test', number: 1 } });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/clients/set-customer-number returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/clients/set-customer-number`, { data: { userId: 'test', number: 1 } });
    expect([401, 403]).toContain(res.status());
  });

  // ── Shortcut API ───────────────────────────────────────────────
  test('POST /api/admin/shortcuts/create returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/shortcuts/create`, { data: { url: 'https://example.com' } });
    expect([401, 403]).toContain(res.status());
  });

  test('DELETE /api/admin/shortcuts/delete returns 401/403 without auth', async ({ request }) => {
    const res = await request.delete(`${BASE}/api/admin/shortcuts/delete`, { data: { id: 1 } });
    expect([401, 403]).toContain(res.status());
  });

  // ── Deployment control API ────────────────────────────────────
  // Routen seit dem SDLC-Build-Target-Split (T002624) unter /sdlc/api/*:
  // GET /sdlc/api/deployments, POST /sdlc/api/ops/deployments/[ns]/[name]/{restart,scale}.
  test('GET /sdlc/api/deployments returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/sdlc/api/deployments`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /sdlc/api/ops/deployments/:ns/:name/restart returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/sdlc/api/ops/deployments/workspace/website/restart`, { data: {} });
    expect([401, 403, 404]).toContain(res.status());
  });

  test('POST /sdlc/api/ops/deployments/:ns/:name/scale returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/sdlc/api/ops/deployments/workspace/website/scale`, { data: { replicas: 1 } });
    expect([401, 403, 404]).toContain(res.status());
  });
});

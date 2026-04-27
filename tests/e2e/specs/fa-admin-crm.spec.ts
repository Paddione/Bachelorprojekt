import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Admin CRM & operations pages', () => {
  // ── Page auth-gating ───────────────────────────────────────────
  const adminPages = [
    '/admin/termine',
    '/admin/kalender',
    '/admin/followups',
    '/admin/nachrichten',
    '/admin/inbox',
    '/admin/raeume',
    '/admin/projekte',
    '/admin/meetings',
    '/admin/zeiterfassung',
  ];

  for (const path of adminPages) {
    test(`${path} redirects unauthenticated users`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await expect(page).not.toHaveURL(`${BASE}${path}`);
    });
  }

  test('/admin/projekte/:id redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/projekte/1`);
    await expect(page).not.toHaveURL(/\/admin\/projekte\/\d+/);
  });

  test('/admin/meetings/:id redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/meetings/00000000-0000-0000-0000-000000000000`);
    await expect(page).not.toHaveURL(/\/admin\/meetings\/.+/);
  });

  // ── Follow-ups API ─────────────────────────────────────────────
  test('POST /api/admin/followups/create returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/followups/create`, {
      form: { reason: 'test', dueDate: '2026-05-01' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/followups/update returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/followups/update`, { form: { id: '1', done: 'true' } });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/followups/delete returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/followups/delete`, { form: { id: '1' } });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/followups/notify returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/followups/notify`, { form: { id: '1' } });
    expect([401, 403]).toContain(res.status());
  });

  // ── Time tracking (Zeiterfassung) API ─────────────────────────
  test('POST /api/admin/zeiterfassung/create returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/zeiterfassung/create`, { form: { projectId: '1', minutes: '60' } });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/zeiterfassung/delete returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/zeiterfassung/delete`, { form: { id: '1' } });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/zeiterfassung/export returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/zeiterfassung/export`);
    expect([401, 403]).toContain(res.status());
  });

  // ── Projekte API ───────────────────────────────────────────────
  test('POST /api/admin/projekte/create returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/projekte/create`, { data: { name: 'Test' } });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/projekte/update returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/projekte/update`, { data: { id: 1, name: 'X' } });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/projekte/delete returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/projekte/delete`, { data: { id: 1 } });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/projekte/export returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/projekte/export`);
    expect([401, 403]).toContain(res.status());
  });

  // ── Rooms API ─────────────────────────────────────────────────
  test('GET /api/admin/rooms returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/rooms`);
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/admin/rooms/direct returns 401/403 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/rooms/direct`, { data: { userId: 'test' } });
    expect([401, 403]).toContain(res.status());
  });

  // ── Meetings API ──────────────────────────────────────────────
  test('GET /api/admin/meetings returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/meetings`);
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/admin/meetings/:id returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/meetings/00000000-0000-0000-0000-000000000000`);
    expect([401, 403, 404]).toContain(res.status());
  });

  // ── Inbox API ─────────────────────────────────────────────────
  test('GET /api/admin/inbox returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/inbox`);
    expect([401, 403]).toContain(res.status());
  });

  // ── Staleness / monitoring API ────────────────────────────────
  test('GET /api/admin/staleness-report returns 401/403 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/staleness-report`);
    expect([401, 403]).toContain(res.status());
  });
});

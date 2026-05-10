import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA: Coaching Publish — phase 2', () => {
  test('T1: GET /admin/knowledge/templates redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/knowledge/templates`);
    await expect(page).not.toHaveURL(`${BASE}/admin/knowledge/templates`);
  });

  test('T2: GET /api/admin/coaching/templates returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/coaching/templates`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: POST /api/admin/coaching/snippets/<id>/draft-template returns 401', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.post(`${BASE}/api/admin/coaching/snippets/${fakeId}/draft-template`, {
      data: { targetSurface: 'questionnaire', payload: {} },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: POST /api/admin/coaching/templates/<id>/publish returns 401', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.post(`${BASE}/api/admin/coaching/templates/${fakeId}/publish`);
    expect([401, 403]).toContain(res.status());
  });

  test('T5: GET /admin/knowledge/snippets/<random>/publish handles missing snippet gracefully', async ({ request }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request.get(`${BASE}/admin/knowledge/snippets/${fakeId}/publish`);
    expect(res.status()).toBeLessThan(500);
  });
});

import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('FA-Questionnaire: Fragebögen', () => {
  test('T1: /api/portal/questionnaires requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/questionnaires`);
    expect([401, 403]).toContain(res.status());
  });

  test('T2: /api/portal/questionnaires/:id requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/portal/questionnaires/test-id`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: /api/portal/questionnaires/:id/answer requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/api/portal/questionnaires/test-id/answer`, {
      data: { questionId: 'q1', answer: 'test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: /api/portal/questionnaires/:id/submit requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/api/portal/questionnaires/test-id/submit`, {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T5: /portal/fragebogen/:id redirects unauthenticated users to login', async ({ page }) => {
    await page.goto(`${BASE}/portal/fragebogen/test-assignment-id`);
    await expect(page).not.toHaveURL(/\/portal\/fragebogen/);
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('T6: Portal ?section=fragebögen does not show a 404', async ({ page }) => {
    // Unauthenticated: redirects to login. Either way, no 404.
    const res = await page.goto(`${BASE}/portal?section=fragebögen`);
    await expect(page.locator('body')).not.toContainText('404');
    expect(res?.status()).not.toBe(500);
  });
});

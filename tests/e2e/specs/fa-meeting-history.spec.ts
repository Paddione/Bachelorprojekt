import { test, expect } from '@playwright/test';

test.describe('Meeting History', () => {
  test('T1 – /api/meeting/release requires authentication', async ({ request }) => {
    const res = await request.post('/api/meeting/release', {
      data: { meetingId: 'test-123' },
    });
    // Unauthenticated request should be rejected (401 or 403)
    expect([401, 403]).toContain(res.status());
  });

  test('T2 – /portal?tab=meetings does not return a 404 page', async ({ page }) => {
    await page.goto('/portal?tab=meetings');
    // Without auth we get redirected; page should not be a 404
    await expect(page.locator('body')).not.toContainText('404');
  });

  test('T3 – navigating to /portal?tab=meetings is handled gracefully', async ({ page }) => {
    const response = await page.goto('/portal?tab=meetings');
    // Should not be a server error
    expect(response?.status()).not.toBe(500);
  });
});

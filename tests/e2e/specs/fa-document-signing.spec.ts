import { test, expect } from '@playwright/test';

test.describe('Document Signing', () => {
  test('T1 – /api/signing/confirm requires authentication', async ({ request }) => {
    const res = await request.post('/api/signing/confirm', {
      data: { documentName: 'test.pdf', documentPath: '/Clients/test/pending-signatures/test.pdf' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T2 – /portal/document page exists (not 404)', async ({ page }) => {
    const response = await page.goto('/portal/document?path=%2FClients%2Ftest%2Fpending-signatures%2Ftest.pdf');
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
  });

  test('T3 – signatures tab in portal does not show 404', async ({ page }) => {
    await page.goto('/portal?tab=signatures');
    await expect(page.locator('body')).not.toContainText('404');
  });
});

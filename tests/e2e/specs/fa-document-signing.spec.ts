import { test, expect } from '@playwright/test';

// Playwright's request fixture uses Node.js DNS which doesn't auto-resolve *.localhost
// (Chrome does, but Node.js doesn't). Use 127.0.0.1 with explicit Host header instead.
function resolveApiUrl(path: string): { url: string; headers: Record<string, string> } {
  const base = process.env.WEBSITE_URL || 'http://localhost:4321';
  const parsed = new URL(base);
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  return {
    url: `${parsed.protocol}//127.0.0.1:${port}${path}`,
    headers: { Host: parsed.hostname },
  };
}

test.describe('Document Signing', () => {
  test('T1 – /api/signing/confirm requires authentication', async ({ request }) => {
    const { url, headers } = resolveApiUrl('/api/signing/confirm');
    const res = await request.post(url, {
      data: { documentName: 'test.pdf', documentPath: '/Clients/test/pending-signatures/test.pdf' },
      headers,
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

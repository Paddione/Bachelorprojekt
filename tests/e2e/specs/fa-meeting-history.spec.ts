import { test, expect } from '@playwright/test';

// Playwright's request fixture uses Node.js DNS which doesn't auto-resolve *.localhost
// (Chrome does, but Node.js doesn't). Use 127.0.0.1 with explicit Host header for localhost only.
function resolveApiUrl(path: string): { url: string; headers: Record<string, string> } {
  const base = process.env.WEBSITE_URL || 'http://localhost:4321';
  const parsed = new URL(base);
  if (parsed.hostname.endsWith('.localhost') || parsed.hostname === 'localhost') {
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    return {
      url: `${parsed.protocol}//127.0.0.1:${port}${path}`,
      headers: { Host: parsed.hostname },
    };
  }
  return { url: `${base}${path}`, headers: {} };
}

test.describe('Meeting History', () => {
  test('T1 – /api/meeting/release requires authentication', async ({ request }) => {
    const { url, headers } = resolveApiUrl('/api/meeting/release');
    const res = await request.post(url, {
      data: { meetingId: 'test-123' },
      headers,
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

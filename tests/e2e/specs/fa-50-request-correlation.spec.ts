import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// Centralized logging (T000964): the loggingMiddleware in website/src/middleware/logging.ts
// injects X-Request-ID into every API response. Either echoes the incoming header or
// generates a fresh nanoid(12). Testable without auth via the public /api/health route.
// NOTE: The middleware fix (clone Response instead of mutating immutable headers) must be
// deployed before T1/T2 can pass against the live URL.
test.describe('FA-50: Request-ID Correlation (T000964)', { tag: ['@website'] }, () => {
  test('T1: API responses carry X-Request-ID header', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    const reqId = res.headers()['x-request-id'];
    expect(reqId).toBeTruthy();
    expect(reqId!.length).toBeGreaterThan(4);
  });

  test('T2: Custom X-Request-ID is echoed back', async ({ request }) => {
    const myId = 'e2e-test-id-12345';
    const res = await request.get(`${BASE}/api/health`, {
      headers: { 'X-Request-ID': myId },
    });
    expect(res.headers()['x-request-id']).toBe(myId);
  });

  test('T3: Homepage loads without server error', async ({ page }) => {
    const res = await page.goto(`${BASE}/`);
    expect(res?.status()).toBeLessThan(500);
  });

  test('T4: API /api/health returns 200 with ok=true', async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });
});

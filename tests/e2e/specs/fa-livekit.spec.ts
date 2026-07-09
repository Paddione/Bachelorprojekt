import { test, expect } from '@playwright/test';
import { assertReachable } from '../lib/health-assertions';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';
const DOMAIN = process.env.PROD_DOMAIN || 'localhost';

test.describe('FA-LiveKit: Livestream — Auth-Gating & API', () => {
  test('T1: /admin/stream redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/admin/stream`);
    await expect(page).not.toHaveURL(/\/admin\/stream$/, { timeout: 60_000 });
  });

  test('T2: /portal/stream redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${BASE}/portal/stream`);
    await expect(page).not.toHaveURL(/\/portal\/stream$/, { timeout: 60_000 });
  });

  test('T3: /api/stream/token requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/api/stream/token`, {
      data: { room: 'e2e-probe' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('T4: /api/stream/status endpoint exists', async ({ request }) => {
    const res = await request.get(`${BASE}/api/stream/status`);
    expect([200, 401, 403]).toContain(res.status());
  });

  test('T5: /api/stream/end requires authentication', async ({ request }) => {
    const res = await request.post(`${BASE}/api/stream/end`);
    expect([401, 403]).toContain(res.status());
  });

  test('T6: LiveKit server ingress is reachable', async ({ request }, testInfo) => {
    await assertReachable(
      request,
      `https://livekit.${DOMAIN}/`,
      { acceptableStatuses: [200, 404, 426], timeout: 10_000, label: 'LiveKit' },
      testInfo
    );
  });
});

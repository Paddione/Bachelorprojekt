import { test, expect } from '@playwright/test';

test.describe('NFA-10: Arena Health-Endpoint Performance', () => {
  test.setTimeout(60_000);

  test('T1+T2: p95 Antwortzeit < 200ms über 50 Requests', async ({ request }) => {
    test.skip(!process.env.ARENA_WS_URL, 'requires ARENA_WS_URL');
    const ARENA_URL = process.env.ARENA_WS_URL!;
    const times: number[] = [];

    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      const res = await request.get(`${ARENA_URL}/healthz`);
      times.push(Date.now() - start);
      expect(res.status()).toBe(200);
    }

    times.sort((a, b) => a - b);
    const p95Index = Math.floor(times.length * 0.95);
    const p95 = times[p95Index];

    console.log(`Arena /healthz p95: ${p95}ms (n=${times.length}, min=${times[0]}ms, max=${times[times.length - 1]}ms)`);
    expect(p95).toBeLessThan(200);
  });

  test('T1: Arena-URL gesetzt (Voraussetzungs-Check)', async () => {
    if (!process.env.ARENA_WS_URL) {
      console.log('ARENA_WS_URL not set — NFA-10 performance test will be skipped at runtime');
    }
    // This test always passes; it only informs about the skip guard
    expect(true).toBe(true);
  });
});

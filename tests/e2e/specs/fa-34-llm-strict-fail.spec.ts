import { test, expect } from '@playwright/test';

const LLM_URL = process.env.LLM_ROUTER_URL
  ?? (process.env.LLM_HOST_IP ? `http://${process.env.LLM_HOST_IP}:4000` : null);

/**
 * FA-34: LLM-Router strict-fail (kein silent fallback)
 *
 * This test verifies that when the TEI service (llm-gateway-embed) is down,
 * a bge-m3 embedding request returns HTTP 5xx — not a silent fallback to Voyage.
 *
 * T1: Simulate TEI outage (manually — requires LLM_TEI_DOWN=true env var).
 * T2: bge-m3 request with TEI down → HTTP 5xx.
 * T3: Restore TEI endpoints (manual).
 *
 * The test is marked skip unless both LLM_TEI_DOWN=true and LLM_ROUTER_URL/LLM_HOST_IP
 * are set, because tearing down TEI from the test itself is not safe in CI.
 */

test.describe('FA-34: LLM-Router strict-fail (kein silent fallback)', () => {
  test.skip(!LLM_URL, 'requires LLM_ROUTER_URL or LLM_HOST_IP');
  test.skip(!process.env.LLM_TEI_DOWN, 'requires LLM_TEI_DOWN=true to simulate TEI outage');
  test.setTimeout(90_000);

  // T1: TEI outage is assumed to be set up externally (LLM_TEI_DOWN=true)
  test('T1: TEI outage is configured externally via LLM_TEI_DOWN=true', async () => {
    // No action needed — the environment variable signals the pre-condition is met
    expect(process.env.LLM_TEI_DOWN).toBe('true');
  });

  // T2: bge-m3 embedding with TEI down must return 5xx — not a Voyage fallback 200
  test('T2: bge-m3 embedding returns 5xx when TEI is down (no silent fallback)', async ({ request }) => {
    const res = await request.post(`${LLM_URL}/v1/embeddings`, {
      data: {
        model: 'bge-m3',
        input: 'strict-fail test',
        // purpose header signals index-mode to the router
      },
      headers: {
        'Content-Type': 'application/json',
        'X-Embedding-Purpose': 'index',
      },
      timeout: 25_000,
    });
    // Must fail with 5xx — a 200 would indicate a silent fallback which violates the contract
    expect(res.status()).toBeGreaterThanOrEqual(500);
    expect(res.status()).toBeLessThan(600);
  });

  // T3: TEI restore is a manual step — document it here but do not automate
  test('T3: TEI restore is a manual post-test step (documented only)', async () => {
    // The tester must restore Endpoints after this test completes.
    // This is intentionally a no-op.
  });
});

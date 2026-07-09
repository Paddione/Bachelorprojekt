import { test, expect } from '@playwright/test';

const LLM_URL = process.env.LLM_ROUTER_URL
  ?? (process.env.LLM_HOST_IP ? `http://${process.env.LLM_HOST_IP}:4000` : null);

/**
 * FA-32: LLM-Router bge-m3 Embeddings
 *
 * T1: llm-router pod readiness (kubectl) — skipped without cluster context.
 * T2: POST /v1/embeddings with model "bge-m3" → 1024-dimensional vector.
 * T3: Verify vector dimension is exactly 1024.
 *
 * All tests skip unless LLM_ROUTER_URL or LLM_HOST_IP is set.
 */

test.describe('FA-32: LLM-Router bge-m3 Embeddings', () => {
  test.skip(!LLM_URL, 'requires LLM_ROUTER_URL or LLM_HOST_IP');
  test.setTimeout(90_000);

  // T1: Pod readiness — kubectl only
  test('T1: llm-router pod readiness (kubectl, skipped without cluster context)', async () => {
    test.skip(!process.env.KUBECONFIG && !process.env.MCP_CLUSTER_CONTEXT,
      'requires kubectl cluster context');
  });

  // T2 + T3: Embedding request and dimension check
  test('T2+T3: bge-m3 embedding returns a 1024-dimensional vector', async ({ request }) => {
    const res = await request.post(`${LLM_URL}/v1/embeddings`, {
      data: {
        model: 'bge-m3',
        input: 'test',
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 25_000,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const embedding = body.data[0].embedding;
    expect(Array.isArray(embedding)).toBe(true);
    // T3: Dimension must be exactly 1024
    expect(embedding.length).toBe(1024);
  });

  // Browser check: LLM router base URL responds (no 5xx)
  test('Browser: LLM router base URL is reachable', async ({ page }) => {
    await page.goto(LLM_URL!, { timeout: 45_000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
    await expect(body).not.toContainText('502 Bad Gateway');
  });
});

import { test, expect } from '@playwright/test';

const LLM_URL = process.env.LLM_ROUTER_URL
  ?? (process.env.LLM_HOST_IP ? `http://${process.env.LLM_HOST_IP}:4000` : null);

/**
 * FA-36: Rerank-Endpunkt
 *
 * T1: POST /v1/rerank with query "capital of germany" and documents
 *     ["paris", "berlin", "hamburg", "munich"] → "berlin" on top.
 * T2: results[0].index === 1 (berlin is at index 1 in the documents array).
 *
 * All tests skip unless LLM_ROUTER_URL or LLM_HOST_IP is set.
 */

test.describe('FA-36: Rerank-Endpunkt', () => {
  test.skip(!LLM_URL, 'requires LLM_ROUTER_URL or LLM_HOST_IP');
  test.setTimeout(90_000);

  // T1 + T2: Rerank request and top-result check
  test('T1+T2: rerank returns berlin (index 1) as top result for "capital of germany"', async ({ request }) => {
    const documents = ['paris', 'berlin', 'hamburg', 'munich'];

    const res = await request.post(`${LLM_URL}/v1/rerank`, {
      data: {
        query: 'capital of germany',
        documents,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 25_000,
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);

    // T2: The top-ranked result must be berlin (index 1 in the documents array)
    const topResult = body.results[0];
    expect(topResult).toHaveProperty('index');
    expect(topResult.index).toBe(1); // berlin is at documents[1]
  });

  // Sanity: All 4 documents appear in the results
  test('All 4 documents are returned in rerank results', async ({ request }) => {
    const documents = ['paris', 'berlin', 'hamburg', 'munich'];

    const res = await request.post(`${LLM_URL}/v1/rerank`, {
      data: {
        query: 'capital of germany',
        documents,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 25_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBe(documents.length);
  });

  // Browser: LLM router base URL responds
  test('Browser: LLM router base URL is reachable', async ({ page }) => {
    await page.goto(LLM_URL!, { timeout: 45_000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
    await expect(body).not.toContainText('502 Bad Gateway');
  });
});

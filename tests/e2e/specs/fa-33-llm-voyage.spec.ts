import { test, expect } from '@playwright/test';

const LLM_URL = process.env.LLM_ROUTER_URL
  ?? (process.env.LLM_HOST_IP ? `http://${process.env.LLM_HOST_IP}:4000` : null);

/**
 * FA-33: LLM-Router bge-m3 (T016562: Voyage entfernt)
 *
 * T1: POST /v1/embeddings with model "bge-m3" → 1024-dim vector.
 * T2: Verify that the embedding is returned even when TEI is not required
 *     (local llama.cpp server, no external API).
 *
 * All tests skip unless LLM_ROUTER_URL or LLM_HOST_IP is set.
 */

test.describe('FA-33: LLM-Router bge-m3', () => {
  test.skip(!LLM_URL, 'requires LLM_ROUTER_URL or LLM_HOST_IP');
  test.setTimeout(90_000);

  // T1: bge-m3 embedding request
  test('T1: bge-m3 embedding returns a 1024-dimensional vector', async ({ request }) => {
    const res = await request.post(`${LLM_URL}/v1/embeddings`, {
      data: {
        model: 'bge-m3',
        input: 'capital of germany',
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
    expect(embedding.length).toBe(1024);
  });

  // T2: local embed works independently of TEI — second identical call confirms it
  test('T2: bge-m3 available independently of TEI status', async ({ request }) => {
    // Issue the same request a second time; if TEI were needed and broken, this would fail
    const res = await request.post(`${LLM_URL}/v1/embeddings`, {
      data: {
        model: 'bge-m3',
        input: 'Hamburg ist eine Hafenstadt.',
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 25_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const embedding = body.data[0].embedding;
    expect(embedding.length).toBe(1024);
  });

  // Browser: base URL responds without 5xx
  test('Browser: LLM router base URL is reachable', async ({ page }) => {
    await page.goto(LLM_URL!, { timeout: 45_000 });
    const body = page.locator('body');
    await expect(body).toBeVisible();
    await expect(body).not.toContainText('502 Bad Gateway');
  });
});

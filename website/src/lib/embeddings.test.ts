import { describe, test, expect, beforeEach, vi } from 'vitest';
import { embedQuery, embedBatch, costCentsForTokens, ANTHROPIC_FALLBACK_MODEL_DIM } from './embeddings';

const ORIGINAL_FETCH = global.fetch;

describe('embeddings client', () => {
  beforeEach(() => { global.fetch = ORIGINAL_FETCH; });

  test('embedQuery returns a 1024-dim float array on happy path', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0.01) }], usage: { total_tokens: 12 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const r = await embedQuery('hello world');
    expect(r.embedding).toHaveLength(1024);
    expect(r.tokens).toBe(12);
  });

  test('embedBatch chunks at 128 inputs per request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: Array(128).fill({ embedding: Array(1024).fill(0) }), usage: { total_tokens: 1280 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;
    const inputs = Array(300).fill('x');
    const out = await embedBatch(inputs);
    expect(out.embeddings).toHaveLength(300);
    expect(fetchMock).toHaveBeenCalledTimes(3);   // 128 + 128 + 44
  });

  test('embedQuery retries on 429 with backoff and finally throws after 4 attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate', { status: 429 }));
    global.fetch = fetchMock;
    await expect(embedQuery('x', { maxAttempts: 4, baseDelayMs: 1 })).rejects.toThrow(/voyage.*429/i);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('costCentsForTokens uses voyage tariff (~$0.06/M)', () => {
    expect(costCentsForTokens(1_000_000)).toBeCloseTo(6, 0);
  });

  test('ANTHROPIC_FALLBACK_MODEL_DIM is 1024 for voyage-multilingual-2', () => {
    expect(ANTHROPIC_FALLBACK_MODEL_DIM).toBe(1024);
  });
});

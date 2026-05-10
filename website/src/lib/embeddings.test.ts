import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('embeddings client — router mode (LLM_ENABLED=true)', () => {
  const ORIGINAL_ENV = process.env.LLM_ENABLED;
  const ORIGINAL_URL = process.env.LLM_ROUTER_URL;

  beforeEach(() => {
    process.env.LLM_ENABLED = 'true';
    process.env.LLM_ROUTER_URL = 'http://llm-router.test:4000';
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    process.env.LLM_ENABLED = ORIGINAL_ENV;
    process.env.LLM_ROUTER_URL = ORIGINAL_URL;
  });

  test('routes bge-m3 query to LLM_ROUTER_URL with X-LLM-Purpose=query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0.02) }], usage: { total_tokens: 8 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;

    const r = await embedQuery('hallo', { model: 'bge-m3', purpose: 'query' });
    expect(r.embedding).toHaveLength(1024);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://llm-router.test:4000/v1/embeddings');
    expect((init as RequestInit).headers).toMatchObject({ 'X-LLM-Purpose': 'query' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('bge-m3');
  });

  test('routes voyage-multilingual-2 model through the router (no direct voyage call)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0.03) }], usage: { total_tokens: 9 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;
    await embedQuery('hi', { model: 'voyage-multilingual-2', purpose: 'query' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('llm-router.test');
  });

  test('purpose=index, router 503 → throws EmbeddingIndexError (no fallback)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('upstream down', { status: 503 }));
    await expect(
      embedBatch(['a', 'b'], { model: 'bge-m3', purpose: 'index', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingIndexError/);
  });

  test('purpose=query, router 503 → throws EmbeddingQueryError (no fallback)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    await expect(
      embedQuery('q', { model: 'bge-m3', purpose: 'query', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingQueryError/);
  });

  test('LLM_ENABLED=false ignores model param and uses direct voyage call', async () => {
    process.env.LLM_ENABLED = 'false';
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0) }], usage: { total_tokens: 1 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;
    await embedQuery('x', { model: 'bge-m3', purpose: 'query' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('voyageai.com');
  });
});

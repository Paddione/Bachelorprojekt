import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { embedQuery, embedBatch } from './embeddings';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_EMBED_URL = process.env.LLM_EMBED_URL;
const ORIGINAL_EMBED_MODEL = process.env.LLM_EMBED_MODEL;
const INTERACTIVE = 'http://llm-router.test:4000';

const embedBody = (body: object) =>
  () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('embeddings client (Gemma-Dense, kein Fremdmodell)', () => {
  beforeEach(() => {
    process.env.LLM_EMBED_URL = INTERACTIVE;
    delete process.env.LLM_EMBED_MODEL;
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    process.env.LLM_EMBED_URL = ORIGINAL_EMBED_URL;
    if (ORIGINAL_EMBED_MODEL === undefined) delete process.env.LLM_EMBED_MODEL;
    else process.env.LLM_EMBED_MODEL = ORIGINAL_EMBED_MODEL;
  });

  test('embedQuery returns a 768-dim float array on happy path', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(768).fill(0.01) }], usage: { total_tokens: 12 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const r = await embedQuery('hello world');
    expect(r.embedding).toHaveLength(768);
    expect(r.tokens).toBe(12);
  });

  test('embedBatch chunks at 128 inputs per request', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: unknown, init: unknown) => {
      const n = JSON.parse((init as RequestInit).body as string).input.length;
      return new Response(
        JSON.stringify({ data: Array(n).fill({ embedding: Array(768).fill(0.01) }), usage: { total_tokens: n * 10 } }),
        { status: 200 },
      );
    });
    global.fetch = fetchMock;
    const inputs = Array(300).fill('x');
    const out = await embedBatch(inputs);
    expect(out.embeddings).toHaveLength(300);
    expect(fetchMock).toHaveBeenCalledTimes(3);   // 128 + 128 + 44
  });

  test('embedQuery retries on 429 with backoff and finally throws after 4 attempts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate', { status: 429 }));
    global.fetch = fetchMock;
    await expect(embedQuery('x', { maxAttempts: 4, baseDelayMs: 1 })).rejects.toThrow(/router.*429/i);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('routes Gemma query formatted with X-LLM-Purpose=query', async () => {
    const fetchMock = vi.fn().mockImplementation(embedBody(
      { data: [{ embedding: Array(768).fill(0.02) }], usage: { total_tokens: 8 } }));
    global.fetch = fetchMock;

    const r = await embedQuery('hallo', { model: 'embeddinggemma-300m', purpose: 'query' });
    expect(r.embedding).toHaveLength(768);

    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).endsWith('/v1/embeddings'));
    expect(call).toBeDefined();
    const [url, init] = call as [string, RequestInit];
    expect(String(url)).toBe(`${INTERACTIVE}/v1/embeddings`);
    expect(init.headers).toMatchObject({ 'X-LLM-Purpose': 'query' });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('embeddinggemma-300m');
    expect(body.input).toEqual(['task: search result | query: hallo']);
  });

  test('callRouter takes its target from the router: index purpose formatted to the single embed URL', async () => {
    const fetchMock = vi.fn().mockImplementation(embedBody(
      { data: [{ embedding: Array(768).fill(0.02) }], usage: { total_tokens: 8 } }));
    global.fetch = fetchMock;

    await embedBatch(['a'], { model: 'embeddinggemma-300m', purpose: 'index' });

    const call = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).endsWith('/v1/embeddings'));
    expect(String((call as [string])[0])).toBe(`${INTERACTIVE}/v1/embeddings`);
    const body = JSON.parse((call as [string, RequestInit])[1].body as string);
    expect(body.input).toEqual(['title: none | text: a']);
  });

  test('explicit foreign or legacy model labels are rejected, never remapped', async () => {
    global.fetch = vi.fn();
    await expect(embedQuery('x', { model: 'bge-m3' as never })).rejects.toThrow(/EmbeddingQueryError/);
    await expect(embedBatch(['x'], { model: 'voyage-large-2' as never })).rejects.toThrow(/EmbeddingIndexError/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('invalid payloads are purpose errors: empty, count, dimension, NaN, null', async () => {
    const bad = [
      { data: [] },
      { data: [{ embedding: Array(768).fill(0.01) }, { embedding: Array(768).fill(0.01) }] },
      { data: [{ embedding: Array(1024).fill(0.01) }] },
      { data: [{ embedding: Array(768).fill(Number.NaN) }] },
      { data: [{ embedding: Array(768).fill(0) }] },
    ];
    for (const payload of bad) {
      global.fetch = vi.fn().mockImplementation(embedBody({ ...payload, usage: { total_tokens: 1 } }));
      await expect(embedQuery('x', { maxAttempts: 1 })).rejects.toThrow(/EmbeddingQueryError/);
      await expect(embedBatch(['x'], { maxAttempts: 1 })).rejects.toThrow(/EmbeddingIndexError/);
    }
  });

  test('public signatures of embedQuery and embedBatch are unchanged', async () => {
    global.fetch = vi.fn().mockImplementation(embedBody(
      { data: [{ embedding: Array(768).fill(0.02) }], usage: { total_tokens: 4 } }));
    const q = await embedQuery('x');
    expect(Array.isArray(q.embedding)).toBe(true);
    expect(typeof q.tokens).toBe('number');
    const b = await embedBatch(['x']);
    expect(b.embeddings).toHaveLength(1);
    expect(typeof b.tokens).toBe('number');
  });

  test('purpose=index, router 503 → throws EmbeddingIndexError (no fallback)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('upstream down', { status: 503 }));
    await expect(
      embedBatch(['a', 'b'], { model: 'embeddinggemma-300m', purpose: 'index', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingIndexError/);
  });

  test('purpose=query, router 503 → throws EmbeddingQueryError (no fallback)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    await expect(
      embedQuery('q', { model: 'embeddinggemma-300m', purpose: 'query', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingQueryError/);
  });

  test('ECONNREFUSED from router → throws EmbeddingQueryError (fail-closed)', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );
    await expect(
      embedQuery('x', { model: 'embeddinggemma-300m', purpose: 'query', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingQueryError/);
  });

  test('missing LLM_EMBED_URL → throws EmbeddingQueryError (fail-closed)', async () => {
    delete process.env.LLM_EMBED_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    await expect(embedQuery('x', { maxAttempts: 1 })).rejects.toThrow(/EmbeddingQueryError/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('never calls an external embedding API', async () => {
    const fetchMock = vi.fn().mockImplementation(embedBody(
      { data: [{ embedding: Array(768).fill(0.02) }], usage: { total_tokens: 4 } }));
    global.fetch = fetchMock;
    await embedQuery('x');
    await embedBatch(['y']);
    for (const c of fetchMock.mock.calls) {
      expect(String((c as [string])[0])).not.toMatch(/voyageai\.com|api\.(openai|anthropic)\.com/);
    }
  });
});

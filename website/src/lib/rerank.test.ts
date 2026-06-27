import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rerankCandidates } from './rerank';

describe('rerankCandidates', () => {
  const ORIGINAL_RERANK = process.env.LLM_RERANK_ENABLED;
  const ORIGINAL_URL = process.env.LLM_RERANKER_URL;

  beforeEach(() => {
    delete process.env.LLM_RERANK_ENABLED;
    delete process.env.LLM_RERANKER_URL;
  });

  afterEach(() => {
    if (ORIGINAL_RERANK === undefined) delete process.env.LLM_RERANK_ENABLED;
    else process.env.LLM_RERANK_ENABLED = ORIGINAL_RERANK;
    if (ORIGINAL_URL === undefined) delete process.env.LLM_RERANKER_URL;
    else process.env.LLM_RERANKER_URL = ORIGINAL_URL;
  });

  it('returns empty array for empty docs', async () => {
    const out = await rerankCandidates('q', []);
    expect(out).toEqual([]);
  });

  it('returns zero-score passthrough when LLM_RERANK_ENABLED is off', async () => {
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([
      { doc: 'a', score: 0 },
      { doc: 'b', score: 0 },
    ]);
  });

  it('returns zero-score passthrough when reranker URL is missing even if enabled', async () => {
    process.env.LLM_RERANK_ENABLED = 'true';
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out.every((r) => r.score === 0)).toBe(true);
  });

  it('sorts results descending by score when the reranker responds', async () => {
    process.env.LLM_RERANK_ENABLED = 'true';
    process.env.LLM_RERANKER_URL = 'http://rerank.local';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, _init?: RequestInit) => {
      return new Response(
        JSON.stringify([
          { index: 0, score: 0.2 },
          { index: 1, score: 0.9 },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    try {
      const out = await rerankCandidates('q', ['first', 'second']);
      expect(out[0]).toEqual({ doc: 'second', score: 0.9 });
      expect(out[1]).toEqual({ doc: 'first', score: 0.2 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to zero scores when the reranker HTTP call fails', async () => {
    process.env.LLM_RERANK_ENABLED = 'true';
    process.env.LLM_RERANKER_URL = 'http://rerank.local';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response('boom', { status: 500 });
    }) as typeof fetch;
    try {
      const out = await rerankCandidates('q', ['a', 'b']);
      expect(out).toEqual([
        { doc: 'a', score: 0 },
        { doc: 'b', score: 0 },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

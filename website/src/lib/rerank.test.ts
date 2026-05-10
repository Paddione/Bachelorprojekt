import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { rerankCandidates } from './rerank';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENABLED = process.env.LLM_RERANK_ENABLED;
const ORIGINAL_URL = process.env.LLM_ROUTER_URL;

describe('rerank client', () => {
  beforeEach(() => {
    process.env.LLM_RERANK_ENABLED = 'true';
    process.env.LLM_ROUTER_URL = 'http://llm-router.test:4000';
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    process.env.LLM_RERANK_ENABLED = ORIGINAL_ENABLED;
    process.env.LLM_ROUTER_URL = ORIGINAL_URL;
  });

  test('returns docs sorted descending by score on happy path', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { index: 1, relevance_score: 0.9 },
        { index: 0, relevance_score: 0.4 },
        { index: 2, relevance_score: 0.1 },
      ],
    }), { status: 200 }));
    const out = await rerankCandidates('q', ['a', 'b', 'c']);
    expect(out).toEqual([
      { doc: 'b', score: 0.9 },
      { doc: 'a', score: 0.4 },
      { doc: 'c', score: 0.1 },
    ]);
  });

  test('returns input docs with score=0 when LLM_RERANK_ENABLED=false', async () => {
    process.env.LLM_RERANK_ENABLED = 'false';
    global.fetch = vi.fn();
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([{ doc: 'a', score: 0 }, { doc: 'b', score: 0 }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('on router 503 returns input docs with score=0 (graceful)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([{ doc: 'a', score: 0 }, { doc: 'b', score: 0 }]);
  });

  test('empty docs returns empty array without calling fetch', async () => {
    global.fetch = vi.fn();
    const out = await rerankCandidates('q', []);
    expect(out).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

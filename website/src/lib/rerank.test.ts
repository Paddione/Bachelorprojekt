import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { rerankCandidates } from './rerank';
import * as loggerModule from './logger';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENABLED = process.env.LLM_RERANK_ENABLED;
const ORIGINAL_RERANKER_URL = process.env.LLM_RERANKER_URL;
const ORIGINAL_BATCH_URL = process.env.LLM_RERANKER_BATCH_URL;

const PRIMARY = 'http://llm-router.test:4000';
const PARTNER = 'http://llm-batch.test:8086';

/**
 * T002426: seit der Router zwischen den Paaren entscheidet, geht JEDER Aufruf
 * mit einer /health-Probe los. Die Mocks unterscheiden deshalb nach Pfad —
 * ein Mock, der eine Rerank-Antwort auch auf /health liefert, wuerde den Pfad
 * gar nicht erst erreichen.
 */
const health = (ok: boolean, processing = 0) =>
  ok
    ? new Response(JSON.stringify({ status: 'ok', slots_processing: processing }), { status: 200 })
    : new Response('down', { status: 503 });

const rerankBody = (results: Array<{ index: number; relevance_score: number }>) =>
  new Response(JSON.stringify({ results }), { status: 200 });

describe('rerank client', () => {
  beforeEach(() => {
    process.env.LLM_RERANK_ENABLED = 'true';
    process.env.LLM_RERANKER_URL = PRIMARY;
    process.env.LLM_RERANKER_BATCH_URL = PARTNER;
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    process.env.LLM_RERANK_ENABLED = ORIGINAL_ENABLED;
    process.env.LLM_RERANKER_URL = ORIGINAL_RERANKER_URL;
    process.env.LLM_RERANKER_BATCH_URL = ORIGINAL_BATCH_URL;
    vi.restoreAllMocks();
  });

  test('returns docs sorted descending by score on happy path', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(String(url).endsWith('/health')
        ? health(true)
        : rerankBody([
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.4 },
            { index: 2, relevance_score: 0.1 },
          ])));
    const out = await rerankCandidates('q', ['a', 'b', 'c']);
    expect(out).toEqual([
      { doc: 'b', score: 0.9 },
      { doc: 'a', score: 0.4 },
      { doc: 'c', score: 0.1 },
    ]);
  });

  test('returns input docs with score=0 when LLM_RERANK_ENABLED=false and warns', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined);
    process.env.LLM_RERANK_ENABLED = 'false';
    global.fetch = vi.fn();
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([{ doc: 'a', score: 0 }, { doc: 'b', score: 0 }]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('[rerank]'));
  });

  test('primary reranker down, partner healthy → sorted results from the partner, logged as warning', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.endsWith('/health')) return Promise.resolve(health(!u.startsWith(PRIMARY)));
      if (u.startsWith(PRIMARY)) return Promise.resolve(new Response('down', { status: 503 }));
      return Promise.resolve(rerankBody([
        { index: 1, relevance_score: 0.8 },
        { index: 0, relevance_score: 0.2 },
      ]));
    });

    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([{ doc: 'b', score: 0.8 }, { doc: 'a', score: 0.2 }]);
    // Der Wechsel darf nicht still passieren.
    expect(warnSpy).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('[bge-router]'));
  });

  test('both pairs down → score=0 without throwing, degradation logged as warning', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined);
    global.fetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([{ doc: 'a', score: 0 }, { doc: 'b', score: 0 }]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ docs: 2 }),
      expect.stringContaining('[rerank]'),
    );
  });

  test('empty docs returns empty array without calling fetch', async () => {
    global.fetch = vi.fn();
    const out = await rerankCandidates('q', []);
    expect(out).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

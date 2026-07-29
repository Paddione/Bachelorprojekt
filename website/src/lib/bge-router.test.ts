import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { probePair, resolvePair, pairUrl, BgeRoutingError } from './bge-router';
import * as loggerModule from './logger';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = {
  embed: process.env.LLM_EMBED_URL,
  rerank: process.env.LLM_RERANKER_URL,
  embedBatch: process.env.LLM_EMBED_BATCH_URL,
  rerankBatch: process.env.LLM_RERANKER_BATCH_URL,
  queue: process.env.LLM_BGE_QUEUE_LIMIT,
  latency: process.env.LLM_BGE_LATENCY_BUDGET_MS,
};

const INTERACTIVE = 'http://pair-b.test:8095';
const BATCH = 'http://pair-a.test:8085';

/** llama-server /health, gesund und unbelastet */
const healthy = (processing = 0) =>
  new Response(JSON.stringify({ status: 'ok', slots_idle: 4 - processing, slots_processing: processing }), { status: 200 });

describe('bge-router', () => {
  beforeEach(() => {
    process.env.LLM_EMBED_URL = INTERACTIVE;
    process.env.LLM_RERANKER_URL = 'http://pair-b.test:8096';
    process.env.LLM_EMBED_BATCH_URL = BATCH;
    process.env.LLM_RERANKER_BATCH_URL = 'http://pair-a.test:8086';
    process.env.LLM_BGE_QUEUE_LIMIT = '2';
    process.env.LLM_BGE_LATENCY_BUDGET_MS = '5000';
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    process.env.LLM_EMBED_URL = ORIGINAL_ENV.embed;
    process.env.LLM_RERANKER_URL = ORIGINAL_ENV.rerank;
    process.env.LLM_EMBED_BATCH_URL = ORIGINAL_ENV.embedBatch;
    process.env.LLM_RERANKER_BATCH_URL = ORIGINAL_ENV.rerankBatch;
    process.env.LLM_BGE_QUEUE_LIMIT = ORIGINAL_ENV.queue;
    process.env.LLM_BGE_LATENCY_BUDGET_MS = ORIGINAL_ENV.latency;
    vi.restoreAllMocks();
  });

  test('pairUrl reads both pairs from the environment instead of hardcoding them', () => {
    expect(pairUrl('interactive', 'embed')).toBe(INTERACTIVE);
    expect(pairUrl('batch', 'embed')).toBe(BATCH);
  });

  test('probePair reports reachability and load separately', async () => {
    global.fetch = vi.fn().mockResolvedValue(healthy(3));
    const h = await probePair('interactive', 'embed');
    expect(h.reachable).toBe(true);
    expect(h.overloaded).toBe(true); // 3 aktive Slots > Limit 2
  });

  test('healthy primary is used and nothing is logged as a redirect', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined);
    global.fetch = vi.fn().mockResolvedValue(healthy(0));
    const r = await resolvePair('interactive', 'embed');
    expect(r.pair).toBe('interactive');
    expect(r.url).toBe(INTERACTIVE);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('agent traffic falls over from pair B to pair A when B is dead — logged as warning', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined);
    global.fetch = vi.fn().mockImplementation((url: string) =>
      String(url).includes('pair-b') ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(healthy(0)));
    const r = await resolvePair('interactive', 'embed');
    expect(r.pair).toBe('batch');
    expect(r.url).toBe(BATCH);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'interactive', to: 'batch' }),
      expect.stringContaining('[bge-router]'),
    );
  });

  test('reindex traffic falls over from pair A to pair B when A is dead — logged as warning', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined);
    global.fetch = vi.fn().mockImplementation((url: string) =>
      String(url).includes('pair-a') ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(healthy(0)));
    const r = await resolvePair('batch', 'embed');
    expect(r.pair).toBe('interactive');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'batch', to: 'interactive' }),
      expect.stringContaining('[bge-router]'),
    );
  });

  test('overload redirects even though the health check is green', async () => {
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined);
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(String(url).includes('pair-b') ? healthy(5) : healthy(0)));
    const r = await resolvePair('interactive', 'embed');
    expect(r.pair).toBe('batch');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'overloaded' }),
      expect.stringContaining('[bge-router]'),
    );
  });

  test('an overloaded primary is kept when the partner is dead — degradation over outage', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      String(url).includes('pair-b') ? Promise.resolve(healthy(5)) : Promise.reject(new Error('ECONNREFUSED')));
    const r = await resolvePair('interactive', 'embed');
    expect(r.pair).toBe('interactive');
  });

  test('both pairs unreachable → throws, no substitute or zero vectors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(resolvePair('interactive', 'embed')).rejects.toThrow(BgeRoutingError);
  });

  test('rerank role resolves the rerank ports, not the embedding ports', async () => {
    global.fetch = vi.fn().mockResolvedValue(healthy(0));
    const r = await resolvePair('batch', 'rerank');
    expect(r.url).toBe('http://pair-a.test:8086');
  });
});

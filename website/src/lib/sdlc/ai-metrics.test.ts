import { describe, test, expect, vi, beforeEach } from 'vitest';
import * as mod from './ai-metrics';

const queryMock = vi.fn().mockResolvedValue({ rows: [] });

beforeEach(() => {
  queryMock.mockClear();
  mod.__setPoolForTests({ query: (...a: unknown[]) => queryMock(...a) } as never);
});

describe('withAiMetrics', () => {
  test('extrahiert usage-Tokens und loggt success', async () => {
    const res = await mod.withAiMetrics(
      async () => ({ reply: 'hi', usage: { input_tokens: 12, output_tokens: 34 } }),
      { workflow: 'coaching_chat', model: 'claude-sonnet-4-6' },
    );
    expect(res).toEqual({ reply: 'hi', usage: { input_tokens: 12, output_tokens: 34 } });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0][1];
    expect(params).toContain('coaching_chat');
    expect(params).toContain(12);
    expect(params).toContain(34);
  });

  test('rethrowt fn()-Fehler und loggt error', async () => {
    await expect(
      mod.withAiMetrics(async () => { throw new Error('boom'); }, { workflow: 'coaching_chat' }),
    ).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).toHaveBeenCalledTimes(1);
    const params = queryMock.mock.calls[0][1];
    expect(params.some((p: unknown) => typeof p === 'string' && p.includes('boom'))).toBe(true);
  });

  test('DB-Insert-Fehler bricht den Call NICHT', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    const res = await mod.withAiMetrics(
      async () => ({ reply: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }),
      { workflow: 'rag_search' },
    );
    expect(res).toEqual({ reply: 'ok', usage: { input_tokens: 1, output_tokens: 1 } });
  });
});

describe('logAiCall', () => {
  test('schluckt DB-Fehler ohne zu werfen', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    await expect(
      mod.logAiCall({ workflow: 'embedding', latencyMs: 5 }),
    ).resolves.toBeUndefined();
  });
});

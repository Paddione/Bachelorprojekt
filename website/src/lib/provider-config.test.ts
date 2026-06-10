import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('./website-db', () => ({ pool: { query: queryMock } }));

import { getProviderConfig } from './provider-config';

describe('getProviderConfig', () => {
  beforeEach(() => { queryMock.mockReset(); process.env.ANTHROPIC_API_KEY = 'k'; });

  it('returns the highest-priority healthy provider row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [
      { provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' },
    ]});
    const c = await getProviderConfig('website-llm', 'sonnet');
    expect(c.modelId).toBe('deepseek-chat');
    expect(c.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('falls back to anthropic sonnet on DB error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'));
    const c = await getProviderConfig('website-llm', 'sonnet');
    expect(c.provider).toBe('anthropic');
    expect(c.modelId).toBe('claude-sonnet-4-6');
    expect(c.baseUrl).toBeNull();
  });

  it('opus tier never queries the DB', async () => {
    const c = await getProviderConfig('website-llm', 'opus');
    expect(c.provider).toBe('anthropic');
    expect(queryMock).not.toHaveBeenCalled();
  });
});

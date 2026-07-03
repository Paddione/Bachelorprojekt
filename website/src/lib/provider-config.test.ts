import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('./website-db', () => ({ pool: { query: queryMock } }));

import { getProviderConfig, apiKeyForProvider } from './provider-config';

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

  it('passes through context_window/context_budget from the row (T001590)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [
      { provider: 'local-qwen35', model_id: 'qwen3.5-9b@iq4_xs', base_url: 'http://100.102.71.114:1234/v1', context_window: 60000, context_budget: 180000 },
    ]});
    const c = await getProviderConfig('factory-scout', 'sonnet');
    expect(c.contextWindow).toBe(60000);
    expect(c.contextBudget).toBe(180000);
  });

  it('maps new cloud providers to their API-key env vars (T001590)', () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.GEMINI_API_KEY = 'gm-key';
    expect(apiKeyForProvider('openrouter')).toBe('or-key');
    expect(apiKeyForProvider('google-gemini')).toBe('gm-key');
    expect(apiKeyForProvider('local-qwen35')).toBe('not-required');
  });
});

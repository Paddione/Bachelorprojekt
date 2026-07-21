import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateOptions } from './session-agent';
import type { KiConfig } from './coaching-ki-config-db';

const { getProviderByNameMock } = vi.hoisted(() => ({
  getProviderByNameMock: vi.fn(),
}));
vi.mock('./provider-config', () => ({
  getProviderByName: (...a: unknown[]) => getProviderByNameMock(...a),
}));

const baseKiConfig = (provider: string): KiConfig => ({
  id: 1, brand: 'mentolder', provider, isActive: true,
  modelName: provider === 'openai' ? 'gpt-4o-mini' : 'mistral-small-latest',
  displayName: provider, createdAt: new Date(),
  apiKey: 'test-key', apiEndpoint: null, temperature: null, maxTokens: 600,
  topP: null, systemPrompt: null, notes: null, topK: null, thinkingMode: false,
  presencePenalty: null, frequencyPenalty: null, safePrompt: false,
  randomSeed: null, organizationId: null, euEndpoint: false, enabledFields: null,
});

const baseOptions = (provider: string): GenerateOptions => ({
  sessionId: 'sess-1',
  stepNumber: 3,
  coachInputs: { thema: 'Test' },
  kiConfig: baseKiConfig(provider),
  brand: 'mentolder',
  history: [
    { role: 'user', content: 'Step 1 prompt' },
    { role: 'assistant', content: 'Step 1 response' },
  ],
  effectiveSystemPrompt: 'Du bist ein Coaching-Assistent.',
  assembledUserPrompt: 'Klient M0001: Schritt 3',
  stepName: 'Ressourcenanalyse',
  phase: 'analyse',
});

describe('LegacySessionAgent - OpenAI', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); getProviderByNameMock.mockReset(); });

  it('calls OpenAI chat.completions.create with history prepended', async () => {
    getProviderByNameMock.mockResolvedValue({
      provider: 'openai', modelId: 'gpt-4o-mini', baseUrl: null, apiKey: 'test-key',
    });
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'OpenAI antwort' } }],
    });
    vi.doMock('openai', () => ({
      default: vi.fn().mockImplementation(function () {
        return { chat: { completions: { create: mockCreate } } };
      }),
    }));
    const { LegacySessionAgent } = await import('./legacy-session-agent');
    const agent = new LegacySessionAgent();
    const result = await agent.generate(baseOptions('openai'));

    expect(result.aiResponse).toBe('OpenAI antwort');
    expect(result.provider).toBe('openai');
    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0]).toEqual({ role: 'system', content: 'Du bist ein Coaching-Assistent.' });
    expect(call.messages[1]).toEqual({ role: 'user', content: 'Step 1 prompt' });
    expect(call.messages[2]).toEqual({ role: 'assistant', content: 'Step 1 response' });
    expect(call.messages[3]).toEqual({ role: 'user', content: 'Klient M0001: Schritt 3' });
  });

  it('throws if provider is disabled in DB and no apiKey override', async () => {
    getProviderByNameMock.mockRejectedValue(new Error("Provider 'openai' is not enabled"));
    vi.doMock('openai', () => ({ default: vi.fn().mockImplementation(function () { return {}; }) }));
    const { LegacySessionAgent } = await import('./legacy-session-agent');
    const agent = new LegacySessionAgent();
    const opts = { ...baseOptions('openai'), kiConfig: { ...baseKiConfig('openai'), apiKey: null } };
    await expect(agent.generate(opts)).rejects.toThrow('not enabled');
  });
});

describe('LegacySessionAgent - Mistral', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); getProviderByNameMock.mockReset(); });

  it('calls Mistral chat.complete with history prepended', async () => {
    getProviderByNameMock.mockResolvedValue({
      provider: 'mistral', modelId: 'mistral-small-latest', baseUrl: null, apiKey: 'test-key',
    });
    const mockComplete = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Mistral antwort' } }],
    });
    vi.doMock('@mistralai/mistralai', () => ({
      Mistral: vi.fn().mockImplementation(function () {
        return { chat: { complete: mockComplete } };
      }),
    }));
    const { LegacySessionAgent } = await import('./legacy-session-agent');
    const agent = new LegacySessionAgent();
    const result = await agent.generate(baseOptions('mistral'));

    expect(result.aiResponse).toBe('Mistral antwort');
    expect(result.provider).toBe('mistral');
    const call = mockComplete.mock.calls[0][0];
    expect(call.messages[1]).toEqual({ role: 'user', content: 'Step 1 prompt' });
    expect(call.messages[3]).toEqual({ role: 'user', content: 'Klient M0001: Schritt 3' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: (...a: unknown[]) => mockCreate(...a) } };
  },
}));

vi.mock('./session-tools', () => ({
  searchCoachingKnowledgeTool: vi.fn().mockResolvedValue([]),
}));

const { getProviderByNameMock } = vi.hoisted(() => ({
  getProviderByNameMock: vi.fn(),
}));
vi.mock('./provider-config', () => ({
  getProviderByName: (...a: unknown[]) => getProviderByNameMock(...a),
}));

import type { KiConfig } from './coaching-ki-config-db';
import { OpenAICompatibleSessionAgent } from './openai-compatible-session-agent';

const baseConfig = (overrides: Partial<KiConfig> = {}): KiConfig => ({
  id: 1,
  brand: 'mentolder',
  provider: 'deepseek',
  isActive: true,
  modelName: null,
  displayName: 'DeepSeek',
  createdAt: new Date(),
  apiEndpoint: null,
  apiKey: null,
  maxTokens: 100,
  temperature: null,
  topP: null,
  systemPrompt: null,
  notes: null,
  topK: null,
  thinkingMode: false,
  presencePenalty: null,
  frequencyPenalty: null,
  safePrompt: false,
  randomSeed: null,
  organizationId: null,
  euEndpoint: false,
  enabledFields: null,
  ...overrides,
});

const baseOptions = () => ({
  sessionId: 's-1',
  stepNumber: 1,
  coachInputs: {},
  kiConfig: baseConfig(),
  brand: 'mentolder',
  history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
  effectiveSystemPrompt: 'system',
  assembledUserPrompt: 'hi',
  stepName: 'reflect',
  phase: 'scout',
});

beforeEach(() => {
  mockCreate.mockReset();
  getProviderByNameMock.mockReset();
});

describe('OpenAICompatibleSessionAgent (resolve* via public API)', () => {
  it('generate: uses apiEndpoint when provided', async () => {
    getProviderByNameMock.mockResolvedValueOnce({
      provider: 'deepseek', modelId: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test',
    });
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'pong' } }] });
    const out = await new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({ apiEndpoint: 'https://my-proxy.example.com/v1' }),
    });
    expect(out.aiResponse).toBe('pong');
    expect(out.provider).toBe('deepseek');
  });

  it('generate: throws when provider is disabled in DB', async () => {
    getProviderByNameMock.mockRejectedValueOnce(new Error("Provider 'mystery' is not enabled in provider_config"));
    await expect(new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({ provider: 'mystery' as unknown as KiConfig['provider'] }),
    })).rejects.toThrow(/not enabled/);
  });

  it('generate: uses DB api_key when config apiKey is null', async () => {
    getProviderByNameMock.mockResolvedValueOnce({
      provider: 'deepseek', modelId: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'db-key',
    });
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });
    const out = await new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({ provider: 'deepseek', apiKey: null }),
    });
    expect(out.aiResponse).toBe('ok');
  });

  it('generate: uses explicit modelName when provided', async () => {
    let captured = '';
    getProviderByNameMock.mockResolvedValueOnce({
      provider: 'local-ollama', modelId: 'qwen2.5', baseUrl: 'http://localhost:11434/v1', apiKey: 'not-required',
    });
    mockCreate.mockImplementationOnce((req: { model: string }) => {
      captured = req.model;
      return Promise.resolve({ choices: [{ message: { content: 'm' } }] });
    });
    await new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({ provider: 'local-ollama', modelName: 'my-custom-7b' }),
    });
    expect(captured).toBe('my-custom-7b');
  });

  it('generate: defaults model from DB row when no explicit modelName', async () => {
    let captured = '';
    getProviderByNameMock.mockResolvedValueOnce({
      provider: 'deepseek', modelId: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test',
    });
    mockCreate.mockImplementationOnce((req: { model: string }) => {
      captured = req.model;
      return Promise.resolve({ choices: [{ message: { content: 'm' } }] });
    });
    await new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({ provider: 'deepseek', modelName: null }),
    });
    expect(captured).toBe('deepseek-chat');
  });

  it('stream: yields delta text fragments as they arrive', async () => {
    getProviderByNameMock.mockResolvedValueOnce({
      provider: 'deepseek', modelId: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test',
    });
    mockCreate.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: 'hello ' } }] };
        yield { choices: [{ delta: { content: 'world' } }] };
        yield { choices: [{ delta: { content: null } }] };
      })(),
    );
    const chunks: string[] = [];
    for await (const c of new OpenAICompatibleSessionAgent().stream(baseOptions())) chunks.push(c);
    expect(chunks).toEqual(['hello ', 'world']);
  });

  it('generate: forwards the assembled history (system + history + user)', async () => {
    let captured: { messages: { role: string; content: string }[] } = { messages: [] };
    getProviderByNameMock.mockResolvedValueOnce({
      provider: 'deepseek', modelId: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test',
    });
    mockCreate.mockImplementationOnce((req: { messages: { role: string; content: string }[] }) => {
      captured = req;
      return Promise.resolve({ choices: [{ message: { content: 'x' } }] });
    });
    await new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      history: [
        { role: 'user', content: 'h1' },
        { role: 'assistant', content: 'h2' },
      ],
    });
    expect(captured.messages.map(m => `${m.role}:${m.content}`)).toEqual([
      'system:system', 'user:h1', 'assistant:h2', 'user:hi',
    ]);
  });

  it('generate: returns a durationMs that is >= 0', async () => {
    getProviderByNameMock.mockResolvedValueOnce({
      provider: 'deepseek', modelId: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test',
    });
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });
    const out = await new OpenAICompatibleSessionAgent().generate(baseOptions());
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });
});

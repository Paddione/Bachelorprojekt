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

import type { KiConfig } from './coaching-ki-config-db';
import { OpenAICompatibleSessionAgent } from './openai-compatible-session-agent';

const baseConfig = (overrides: Partial<KiConfig> = {}): KiConfig => ({
  id: 'c-1',
  provider: 'deepseek',
  modelName: null,
  apiEndpoint: null,
  apiKey: null,
  maxTokens: 100,
  temperature: null,
  topP: null,
  enabled: true,
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
});

describe('OpenAICompatibleSessionAgent (resolve* via public API)', () => {
  it('generate: uses apiEndpoint when provided', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'pong' } }] });
    const out = await new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({ apiEndpoint: 'https://my-proxy.example.com/v1' }),
    });
    expect(out.aiResponse).toBe('pong');
    expect(out.provider).toBe('deepseek');
  });

  it('generate: throws when apiEndpoint missing and provider has no default', async () => {
    await expect(new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({ provider: 'mystery' as unknown as KiConfig['provider'] }),
    })).rejects.toThrow(/apiEndpoint fehlt/);
  });

  it('generate: falls back to DEEPSEEK_API_KEY env when config apiKey is null', async () => {
    const ORIGINAL = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'sk-from-env';
    try {
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });
      const out = await new OpenAICompatibleSessionAgent().generate({
        ...baseOptions(),
        kiConfig: baseConfig({ provider: 'deepseek', apiKey: null }),
      });
      expect(out.aiResponse).toBe('ok');
    } finally {
      if (ORIGINAL === undefined) delete process.env.DEEPSEEK_API_KEY;
      else process.env.DEEPSEEK_API_KEY = ORIGINAL;
    }
  });

  it('generate: defaults apiKey to "not-required" for unknown providers', async () => {
    const ORIGINAL = process.env.DEEPSEEK_API_KEY;
    const ORIGINAL_AK = process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });
      await new OpenAICompatibleSessionAgent().generate({
        ...baseOptions(),
        kiConfig: baseConfig({ provider: 'mystery' as unknown as KiConfig['provider'], apiEndpoint: 'http://x' }),
      });
      expect(mockCreate).toHaveBeenCalled();
    } finally {
      if (ORIGINAL !== undefined) process.env.DEEPSEEK_API_KEY = ORIGINAL;
      if (ORIGINAL_AK !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_AK;
    }
  });

  it('generate: uses explicit modelName when provided', async () => {
    let captured = '';
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

  it('generate: defaults model to "deepseek-chat" for deepseek', async () => {
    let captured = '';
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

  it('generate: falls back to llama3 for unknown provider with no modelName', async () => {
    let captured = '';
    mockCreate.mockImplementationOnce((req: { model: string }) => {
      captured = req.model;
      return Promise.resolve({ choices: [{ message: { content: 'm' } }] });
    });
    await new OpenAICompatibleSessionAgent().generate({
      ...baseOptions(),
      kiConfig: baseConfig({
        provider: 'mystery' as unknown as KiConfig['provider'],
        apiEndpoint: 'http://x',
        modelName: null,
      }),
    });
    expect(captured).toBe('llama3');
  });

  it('stream: yields delta text fragments as they arrive', async () => {
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
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });
    const out = await new OpenAICompatibleSessionAgent().generate(baseOptions());
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });
});

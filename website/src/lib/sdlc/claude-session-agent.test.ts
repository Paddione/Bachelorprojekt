import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateOptions } from './session-agent';
import type { KiConfig } from './coaching-ki-config-db';

const { getProviderByNameMock } = vi.hoisted(() => ({
  getProviderByNameMock: vi.fn(),
}));
vi.mock('./provider-config', () => ({
  getProviderByName: (...a: unknown[]) => getProviderByNameMock(...a),
}));

const mockKiConfig: KiConfig = {
  id: 1, brand: 'mentolder', provider: 'claude', isActive: true,
  modelName: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku',
  createdAt: new Date(), apiKey: 'test-key', apiEndpoint: null,
  temperature: null, maxTokens: 600, topP: null, systemPrompt: null,
  notes: null, topK: null, thinkingMode: false, presencePenalty: null,
  frequencyPenalty: null, safePrompt: false, randomSeed: null,
  organizationId: null, euEndpoint: false, enabledFields: null,
};

const baseOpts = (): GenerateOptions => ({
  sessionId: 'sess-1',
  stepNumber: 3,
  coachInputs: { thema: 'Test' },
  kiConfig: mockKiConfig,
  brand: 'mentolder',
  history: [{ role: 'user', content: 'Step1 prompt' }, { role: 'assistant', content: 'Step1 resp' }],
  effectiveSystemPrompt: 'Du bist ein Assistent.',
  assembledUserPrompt: 'Klient M0001: Schritt 3',
  stepName: 'Ressourcenanalyse',
  phase: 'analyse',
});

describe('ClaudeSessionAgent', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    getProviderByNameMock.mockReset();
  });

  it('returns text response when Claude responds with text directly', async () => {
    getProviderByNameMock.mockResolvedValue({
      provider: 'claude', modelId: 'claude-haiku-4-5-20251001', baseUrl: null, apiKey: 'test-key',
    });
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(function () {
        return {
          messages: {
            create: vi.fn().mockResolvedValue({
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'Claude-Antwort' }],
            }),
          },
        };
      }),
    }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const result = await agent.generate(baseOpts());
    expect(result.aiResponse).toBe('Claude-Antwort');
    expect(result.provider).toBe('claude');
  });

  it('throws if provider is disabled in DB and no apiKey override', async () => {
    getProviderByNameMock.mockRejectedValue(new Error("Provider 'claude' is not enabled in provider_config"));
    vi.doMock('@anthropic-ai/sdk', () => ({ default: vi.fn().mockImplementation(function () { return {}; }) }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const opts = { ...baseOpts(), kiConfig: { ...mockKiConfig, apiKey: null } };
    await expect(agent.generate(opts)).rejects.toThrow('not enabled');
  });

  it('stops tool loop after 3 rounds and returns last text', async () => {
    getProviderByNameMock.mockResolvedValue({
      provider: 'claude', modelId: 'claude-haiku-4-5-20251001', baseUrl: null, apiKey: 'test-key',
    });
    let callCount = 0;
    const mockCreate = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        return Promise.resolve({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: `tool-${callCount}`, name: 'get_session_step', input: { step_number: 1 } }],
        });
      }
      return Promise.resolve({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Finale Antwort' }],
      });
    });
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(function () {
        return { messages: { create: mockCreate } };
      }),
    }));
    vi.doMock('./session-tools', () => ({
      SESSION_TOOLS: [],
      getSessionStepTool: vi.fn().mockResolvedValue({ found: false }),
      searchCoachingKnowledgeTool: vi.fn().mockResolvedValue([]),
      draftSessionReportTool: vi.fn().mockResolvedValue({ stepsText: '' }),
    }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const result = await agent.generate(baseOpts());
    expect(result.aiResponse).toBe('Finale Antwort');
    expect(callCount).toBe(4);
  });

  it('stops at MAX_TOOL_ROUNDS and returns empty response if never text', async () => {
    getProviderByNameMock.mockResolvedValue({
      provider: 'claude', modelId: 'claude-haiku-4-5-20251001', baseUrl: null, apiKey: 'test-key',
    });
    vi.doMock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(function () {
        return {
          messages: {
            create: vi.fn().mockResolvedValue({
              stop_reason: 'tool_use',
              content: [{ type: 'tool_use', id: 'tool-1', name: 'get_session_step', input: { step_number: 1 } }],
            }),
          },
        };
      }),
    }));
    vi.doMock('./session-tools', () => ({
      SESSION_TOOLS: [],
      getSessionStepTool: vi.fn().mockResolvedValue({ found: false }),
      searchCoachingKnowledgeTool: vi.fn().mockResolvedValue([]),
      draftSessionReportTool: vi.fn().mockResolvedValue({ stepsText: '' }),
    }));
    const { ClaudeSessionAgent } = await import('./claude-session-agent');
    const agent = new ClaudeSessionAgent();
    const result = await agent.generate(baseOpts());
    expect(typeof result.aiResponse).toBe('string');
  });
});

import { describe, it, expect } from 'vitest';
import { createSessionAgent } from './session-agent-factory';

// These tests just need to exercise the dispatch in createSessionAgent — we
// don't care about the agents' actual behaviour, just that the right class is
// returned. We import the real classes to verify the type relationship.

describe('createSessionAgent', () => {
  it('returns a ClaudeSessionAgent for provider "claude"', () => {
    const a = createSessionAgent({ provider: 'claude' } as never);
    expect(a.constructor.name).toBe('ClaudeSessionAgent');
  });

  it('returns an OpenAICompatibleSessionAgent for "lumo" / "deepseek" / "anthropic" aliases', () => {
    for (const provider of ['lumo', 'deepseek', 'anthropic', 'local-cluster', 'local-lmstudio', 'local-ollama']) {
      const a = createSessionAgent({ provider } as never);
      expect(a.constructor.name).toBe('OpenAICompatibleSessionAgent');
    }
  });

  it('returns an OpenAICompatibleSessionAgent for custom_* providers', () => {
    const a = createSessionAgent({ provider: 'custom_litellm' } as never);
    expect(a.constructor.name).toBe('OpenAICompatibleSessionAgent');
  });

  it('returns a LegacySessionAgent for unmapped providers (openai, mistral)', () => {
    expect(createSessionAgent({ provider: 'openai' } as never).constructor.name).toBe('LegacySessionAgent');
    expect(createSessionAgent({ provider: 'mistral' } as never).constructor.name).toBe('LegacySessionAgent');
  });
});

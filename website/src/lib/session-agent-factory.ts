import type { KiConfig } from './coaching-ki-config-db';
import type { SessionAgent } from './session-agent';
import { ClaudeSessionAgent } from './claude-session-agent';
import { LegacySessionAgent } from './legacy-session-agent';
import { OpenAICompatibleSessionAgent } from './openai-compatible-session-agent';

export function createSessionAgent(kiConfig: KiConfig): SessionAgent {
  const { provider } = kiConfig;

  // Anthropic SDK path — handles both native Anthropic and custom baseURL (e.g. llm-router)
  if (provider === 'claude') {
    return new ClaudeSessionAgent();
  }

  // OpenAI-compatible local/custom endpoints → RAG injection from pgvector
  if (provider.startsWith('custom_') || provider === 'lumo') {
    return new OpenAICompatibleSessionAgent();
  }

  // openai / mistral — external APIs, keep legacy behaviour
  return new LegacySessionAgent();
}

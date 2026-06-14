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

  // OpenAI-compatible: custom local, DeepSeek external API, cluster-local gateways
  const OAI_COMPAT = new Set([
    'lumo', 'deepseek', 'anthropic',
    'local-cluster', 'local-lmstudio', 'local-ollama',
  ]);
  if (provider.startsWith('custom_') || OAI_COMPAT.has(provider)) {
    return new OpenAICompatibleSessionAgent();
  }

  // openai / mistral — external APIs, keep legacy behaviour
  return new LegacySessionAgent();
}

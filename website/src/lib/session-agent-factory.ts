import type { KiConfig } from './coaching-ki-config-db';
import type { SessionAgent } from './session-agent';
import { LegacySessionAgent } from './legacy-session-agent';
import { ClaudeSessionAgent } from './claude-session-agent';

export function createSessionAgent(kiConfig: KiConfig): SessionAgent {
  if (kiConfig.provider === 'claude') {
    return new ClaudeSessionAgent();
  }
  return new LegacySessionAgent();
}

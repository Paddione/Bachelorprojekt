import type { KiConfig } from './coaching-ki-config-db';
import type { SessionAgent } from './session-agent';
import { LegacySessionAgent } from './legacy-session-agent';

export function createSessionAgent(kiConfig: KiConfig): SessionAgent {
  return new LegacySessionAgent();
}

import type { KiConfig } from './coaching-ki-config-db';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  sessionId: string;
  stepNumber: number;
  coachInputs: Record<string, string>;
  kiConfig: KiConfig;
  brand: string;
  history: ConversationTurn[];
  effectiveSystemPrompt: string;
  assembledUserPrompt: string;
  stepName: string;
  phase: string;
}

export interface GenerateResult {
  aiResponse: string;
  provider: string;
  model: string;
  durationMs: number;
}

export interface SessionAgent {
  generate(options: GenerateOptions): Promise<GenerateResult>;
  stream?(options: GenerateOptions): AsyncIterable<string>;
}

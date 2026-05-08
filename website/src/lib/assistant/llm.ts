import type { AssistantProfile, Message, ProposedAction } from './types';

export interface AssistantChatInput {
  profile: AssistantProfile;
  userSub: string;
  messages: Array<Pick<Message, 'role' | 'content'>>;
  context: AssistantContext;
}

export interface AssistantContext {
  currentRoute: string;
  counts?: Record<string, number>;
  [k: string]: unknown;
}

export interface AssistantChatResult {
  reply: string;
  proposedAction?: ProposedAction;
}

// STUB. The user wires up the real LLM call in this file.
// Until then, the assistant returns a deterministic placeholder so the rest
// of the system (UI, action loop, nudges) can be developed and tested.
export async function assistantChat(_input: AssistantChatInput): Promise<AssistantChatResult> {
  return {
    reply: 'LLM nicht verbunden — die echte Anbindung lebt in lib/assistant/llm.ts.',
  };
}

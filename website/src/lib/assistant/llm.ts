import type { AssistantProfile, Message, ProposedAction } from './types';
import { searchHelp, formatHit, noMatchReply } from './search';

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

// No LLM is wired here by design — the user owns that decision (DSGVO,
// model choice, key handling). Until they wire one, the assistant falls
// back to a deterministic keyword search over lib/helpContent.ts so it
// stays useful for "wo finde ich X?" / "wie mache ich Y?" questions.
//
// To wire a real LLM later, replace the body of this function. You can
// still call searchHelp() as a tool or as a low-confidence fallback.
export async function assistantChat(input: AssistantChatInput): Promise<AssistantChatResult> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser || !lastUser.content.trim()) {
    return {
      reply: 'Frag mich etwas — ich suche dir die passende Stelle in der Hilfe.',
    };
  }
  const hit = searchHelp(lastUser.content, input.profile);
  if (!hit) {
    return { reply: noMatchReply(input.profile) };
  }
  return { reply: formatHit(hit) };
}

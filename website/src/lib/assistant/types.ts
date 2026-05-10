export type AssistantProfile = 'admin' | 'portal';

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string; // ISO
  proposedAction?: ProposedAction;
}

export interface ProposedAction {
  actionId: string;
  targetLabel: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface Nudge {
  id: string;
  triggerId: string;
  profile: AssistantProfile;
  headline: string;
  body: string;
  primaryAction?: { label: string; kickoff: string };
  secondaryAction?: { label: string; kickoff: string };
  ttlSeconds?: number;
  createdAt: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface AssistantChatResult {
  reply: string;
  proposedAction?: ProposedAction;
  sourcesUsed?: number;
}

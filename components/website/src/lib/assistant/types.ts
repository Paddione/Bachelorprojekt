export type AssistantProfile = 'admin' | 'portal';

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
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

export interface AssistantSource {
  index: number;
  bookTitle: string;
  slug: string;
  page: number | null;
  excerpt: string;
  chunkId: string;
}

export interface AssistantChatResult {
  reply: string;
  proposedAction?: ProposedAction;
  sources?: AssistantSource[];
}

import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import {
  getOrCreateActiveConversation,
  appendMessage,
  loadHistory,
} from '../../../lib/assistant/conversations';
import { assistantChat } from '../../../lib/assistant/llm';
import type { AssistantProfile } from '../../../lib/assistant/types';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  let body: { profile: AssistantProfile; content: string; currentRoute?: string; useBooks?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { profile, content, currentRoute = '/' } = body;
  const useBooks = profile === 'admin' ? (body.useBooks ?? false) : false;
  if (profile !== 'admin' && profile !== 'portal') return json({ error: 'invalid profile' }, 400);
  if (profile === 'admin' && !isAdmin(session)) return json({ error: 'forbidden' }, 403);
  if (typeof content !== 'string' || !content.trim()) return json({ error: 'empty content' }, 400);

  const conv = await getOrCreateActiveConversation(session.sub, profile);
  await appendMessage(conv.id, 'user', content);
  const history = await loadHistory(conv.id);

  const result = await assistantChat({
    profile,
    userSub: session.sub,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
    context: { currentRoute, useBooks },
  });

  const stored = await appendMessage(conv.id, 'assistant', result.reply, result.proposedAction);

  return json({ message: stored, sources: result.sources ?? [] });
};
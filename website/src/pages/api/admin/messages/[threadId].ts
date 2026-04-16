// website/src/pages/api/admin/messages/[threadId].ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getThread, getThreadMessages, addMessage, markThreadRead } from '../../../../lib/messaging-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const [thread, messages] = await Promise.all([
    getThread(threadId),
    getThreadMessages(threadId),
  ]);
  if (!thread) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  await markThreadRead(threadId, 'admin');
  return new Response(JSON.stringify({ thread, messages }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addMessage({ threadId, senderId: session.sub, senderRole: 'admin', body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { headers: { 'Content-Type': 'application/json' } });
};

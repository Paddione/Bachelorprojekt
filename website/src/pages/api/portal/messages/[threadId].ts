// website/src/pages/api/portal/messages/[threadId].ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getThread, getThreadMessages, addMessage, markThreadRead } from '../../../../lib/messaging-db';
import { upsertCustomer } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await upsertCustomer({ name: session.name, email: session.email, keycloakUserId: session.sub });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const thread = await getThread(threadId);
  if (!thread || thread.customer_id !== customer.id) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  const messages = await getThreadMessages(threadId);
  await markThreadRead(threadId, 'user');
  return new Response(JSON.stringify({ thread, messages }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await upsertCustomer({ name: session.name, email: session.email, keycloakUserId: session.sub });
  const threadId = parseInt(params.threadId!, 10);
  if (isNaN(threadId)) return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  const thread = await getThread(threadId);
  if (!thread || thread.customer_id !== customer.id) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const msg = await addMessage({ threadId, senderId: session.sub, senderRole: 'user', senderCustomerId: customer.id, body: body.trim() });
  return new Response(JSON.stringify({ message: msg }), { headers: { 'Content-Type': 'application/json' } });
};

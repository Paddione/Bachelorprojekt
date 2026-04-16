// website/src/pages/api/admin/messages.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listThreadsForAdmin, getOrCreateThreadForCustomer, addMessage } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const threads = await listThreadsForAdmin();
  return new Response(JSON.stringify({ threads }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { customerId, body } = await request.json() as { customerId: string; body: string };
  if (!customerId?.trim() || !body?.trim()) {
    return new Response(JSON.stringify({ error: 'customerId and body required' }), { status: 400 });
  }
  const thread = await getOrCreateThreadForCustomer(customerId);
  const msg = await addMessage({ threadId: thread.id, senderId: session.sub, senderRole: 'admin', body: body.trim() });
  return new Response(JSON.stringify({ thread, message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

// website/src/pages/api/portal/messages.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { getCustomerByEmail, getThreadByCustomerId, getOrCreateThreadForCustomer, addMessage, createInboxItem } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ thread: null }), { headers: { 'Content-Type': 'application/json' } });
  const thread = await getThreadByCustomerId(customer.id);
  return new Response(JSON.stringify({ thread: thread ?? null }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const { body } = await request.json() as { body: string };
  if (!body?.trim()) return new Response(JSON.stringify({ error: 'body required' }), { status: 400 });
  const thread = await getOrCreateThreadForCustomer(customer.id);
  const msg = await addMessage({ threadId: thread.id, senderId: session.sub, senderRole: 'user', senderCustomerId: customer.id, body: body.trim() });
  await createInboxItem({
    type: 'user_message',
    referenceId: String(thread.id),
    referenceTable: 'message_threads',
    payload: { senderName: customer.name, senderEmail: customer.email, message: body.trim().slice(0, 120) },
  });
  return new Response(JSON.stringify({ thread, message: msg }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
